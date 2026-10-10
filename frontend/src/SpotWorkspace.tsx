import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { radiusValue, RadiusError, saveRadius, type Profile } from './api'
import { getSupabaseClient } from './supabase'
import { apiBaseUrl, normalizeCenter, pilotCenter, type Center } from './config'
import { SpotMap } from './SpotMap'
import { SpotScope } from './spotScope'
import { asSpot, asSpots, multipart, photoEndpoint, readOwnConnectionSpots, spotIdPattern, spotRequest, spotsPath, SpotApiError, validateData, validatePhoto, type Audience, type Spot, type SpotData } from './spotApi'
import { searchQuery, searchSpots, SearchApiError, type SearchResult } from './searchApi'
import { ScopedResultsController } from './searchController'
import { ExploredControl } from './ExploredControl'
import { ReportControl } from './ReportControl'
import { SpotLocationController, type SpotLocationState } from './spotLocation'
import { CameraIcon, CheckIcon, DirectionsIcon, ExploreIcon, GlobeIcon, LocateIcon, MapPinIcon, PhotoIcon, PlusIcon, RefreshIcon, SearchIcon, UsersIcon, XIcon, PersonIcon } from './Icons'

type Props = { profile: Profile; recheck: () => void; feed: Audience; onFeedChange: (feed: Audience) => void }
const button = 'ui-button min-h-12 rounded-xl border border-[var(--control-outline)] px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50'
const input = 'mt-1 w-full rounded-xl border border-[var(--control-outline)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const empty = () => ({ title: '', note: '', audience: 'connections' as Audience, accessNote: '', accessConfirmed: false, latitude: '', longitude: '' })
type FormState = ReturnType<typeof empty>

function failure(error: unknown, recheck: () => void): string {
  if (error instanceof SpotApiError) {
    if (error.failure.kind === 'auth') recheck()
    return error.failure.message
  }
  return 'Spot service unavailable. Try again later.'
}

function ProtectedPhoto({ spot, scope, profile, recheck }: { spot: Spot; scope: SpotScope; profile: Profile; recheck: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let owned: string | null = null
    const endpoint = photoEndpoint(apiBaseUrl, spot.photoUrl, spot.id)
    if (!endpoint) { setError(true); return }
    const path = endpoint.slice(apiBaseUrl.length)
    setError(false)
    setUrl(null)
    void scope.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session, (token, signal) => spotRequest(apiBaseUrl, token, path, signal)).then(blob => {
      if (active && blob instanceof Blob) { owned = scope.track(blob); setUrl(owned) }
    }).catch(err => { if (active) { setError(true); failure(err, recheck) } })
    return () => { active = false; scope.revoke(owned) }
  }, [spot.id, spot.photoUrl, scope, profile.id, recheck])
  if (error) return <p role="status">Photo unavailable. Retry by reopening this spot.</p>
  return url ? <img src={url} alt={`Shared photo of ${spot.title}`} className="max-h-80 w-full rounded-lg object-cover" /> : <p role="status">Loading protected photo…</p>
}

function Form({ initial, original, scope, profile, recheck, onSaved, onCancel, refresh }: {
  initial: FormState; original?: Spot; scope: SpotScope; profile: Profile; recheck: () => void;
  onSaved: (spot: Spot) => void; onCancel: () => void; refresh: () => void
}) {
  const [fields, setFields] = useState(initial)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [reconciliationStatus, setReconciliationStatus] = useState('')
  const [ownCandidates, setOwnCandidates] = useState<Spot[]>([])
  const [locationState, setLocationState] = useState<SpotLocationState>({ kind: 'idle' })
  const location = useRef<SpotLocationController | null>(null)
  if (!location.current) location.current = new SpotLocationController(() => navigator.geolocation, state => {
    setLocationState(state)
    if (state.kind === 'success') setFields(current => ({ ...current, latitude: state.latitude, longitude: state.longitude }))
  })
  useEffect(() => () => location.current?.dispose(), [])
  const reconciliation = useRef<SpotScope | null>(null)
  useEffect(() => () => { reconciliation.current?.dispose(); reconciliation.current = null }, [])
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = scope.track(file)
    setPreview(url)
    return () => scope.revoke(url)
  }, [file, scope])
  const change = (name: keyof FormState, value: string | boolean) => {
    if (name === 'latitude' || name === 'longitude') location.current?.cancel()
    setFields(current => ({ ...current, [name]: value }))
  }
  const pin = Number(fields.latitude) >= -90 && Number(fields.latitude) <= 90 && Number(fields.longitude) >= -180 && Number(fields.longitude) <= 180 && fields.latitude.trim() !== '' && fields.longitude.trim() !== '' ? [Number(fields.latitude), Number(fields.longitude)] as [number, number] : null

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = '' // Selecting the same file again should still work.
    if (!next) return // Cancelling a picker never clears the previous selection.
    const problem = validatePhoto(next)
    if (problem) { setMessage(problem); return }
    setMessage('')
    setFile(next)
  }

  async function checkConnections() {
    reconciliation.current?.dispose()
    const lookup = new SpotScope()
    reconciliation.current = lookup
    setOwnCandidates([])
    setReconciliationStatus('Checking your own spots in Connections…')
    try {
      const candidates = await lookup.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session,
        (token, signal) => readOwnConnectionSpots(apiBaseUrl, token, profile.id, signal))
      if (reconciliation.current === lookup && candidates) {
        setOwnCandidates(candidates)
        setReconciliationStatus('Connections check complete. A missing spot is not proof the save failed; processing may still be underway or the 50-row feed may be full.')
      }
    } catch (error) {
      if (reconciliation.current === lookup) setReconciliationStatus(`Connections check unavailable. ${failure(error, recheck)} Do not resubmit based on this check.`)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const data = { ...fields, latitude: fields.latitude.trim() === '' ? NaN : Number(fields.latitude), longitude: fields.longitude.trim() === '' ? NaN : Number(fields.longitude) }
    const problem = validateData(data) || (!original && validatePhoto(file))
    if (problem) { setMessage(problem); return }
    const validated = data as SpotData
    reconciliation.current?.dispose(); reconciliation.current = null
    setPending(true); setMessage(''); setUncertain(false); setReconciliationStatus(''); setOwnCandidates([])
    try {
      const saved = await scope.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session, async (token, signal) => {
        const payload = original
          ? await spotRequest(apiBaseUrl, token, `/spots/${original.id}`, signal, 'PATCH', JSON.stringify(validated), 'application/json')
          : await spotRequest(apiBaseUrl, token, '/spots', signal, 'POST', multipart(validated, file!))
        return asSpot(payload, apiBaseUrl, true)
      })
      if (saved) onSaved(saved)
    } catch (err) {
      setMessage(failure(err, recheck))
      if (err instanceof SpotApiError && err.failure.kind === 'uncertain') { setUncertain(true); refresh(); if (!original) void checkConnections() }
    } finally { setPending(false) }
  }

  return <form onSubmit={e => void save(e)} className="surface card mt-6 space-y-5 p-4 sm:p-6" aria-label={original ? 'Edit spot' : 'Add a spot'}>
    <div><p className="workspace-kicker">{original ? 'Refine the story' : 'Share a discovery'}</p><h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--forest-950)]">{original ? 'Edit spot metadata' : 'Add a spot'}</h3></div>
    {!original && <>
      <p className="text-sm leading-6 text-[var(--ink-muted)]">One photo, up to 10 MiB: JPEG, PNG or WebP. HEIC and animated images are unsupported. </p>
       <div className="flex items-center gap-3">
         <label className={`${button} w-12 px-0`} title="Take photo" aria-label="Take photo with camera where supported"><CameraIcon className="h-5 w-5" /><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectPhoto} disabled={pending} aria-label="Take photo with camera where supported" /></label>
         <label className={`${button} w-12 px-0`} title="Choose photo" aria-label="Choose a photo from device"><PhotoIcon className="h-5 w-5" /><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={pending} aria-label="Choose a photo from device" /></label>
       </div>
       {preview && <img src={preview} alt="Selected photo preview" className="max-h-72 w-full rounded-xl bg-[var(--surface-muted)] object-contain" />}
    </>}
    <label className="block font-medium">Title (1–80)<input className={input} value={fields.title} maxLength={80} required onChange={e => change('title', e.target.value)} /></label>
    <label className="block font-medium">Personal note (1–500)<textarea className={input} value={fields.note} maxLength={500} required rows={4} onChange={e => change('note', e.target.value)} /></label>
    <fieldset className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4"><legend className="font-semibold">Audience</legend>
      <div className="mt-2 space-y-2"><label className="flex min-h-12 items-center gap-3 rounded-lg bg-[var(--surface)] px-3"><input type="radio" checked={fields.audience === 'connections'} onChange={() => change('audience', 'connections')} /> Connections only (default)</label>
      <label className="flex min-h-12 items-center gap-3 rounded-lg bg-[var(--surface)] px-3"><input type="radio" checked={fields.audience === 'public'} onChange={() => change('audience', 'public')} /> Public</label></div>
      {fields.audience === 'public' && <p className="mt-3 rounded-xl bg-[var(--warning-surface)] p-3 text-sm leading-6 text-[var(--warning-text)]">Unfamiliar enrolled pilot members can discover this spot in Public and see your display name, photo, note and exact destination pin.</p>}
    </fieldset>
    <div><p className="font-semibold">Destination pin (required)</p><p className="mb-2 text-sm leading-6 text-[var(--ink-muted)]">Map overview is not your current location. Tap/click the map to select a pin, enter coordinates below, or choose Use current location. Map tiles load from an external provider; location permission is requested only when you choose the button.</p>
       <SpotMap pin={pin} worldPicker onCurrentLocation={(lat, lng) => { location.current?.cancel(); setFields(current => ({ ...current, latitude: lat.toFixed(6), longitude: lng.toFixed(6) })) }} onPick={(lat, lng) => { location.current?.cancel(); setFields(current => ({ ...current, latitude: lat.toFixed(6), longitude: lng.toFixed(6) })) }} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><label>Latitude (-90 to 90)<input className={input} type="number" min={-90} max={90} step="any" inputMode="decimal" value={fields.latitude} onChange={e => change('latitude', e.target.value)} /></label><label>Longitude (-180 to 180)<input className={input} type="number" min={-180} max={180} step="any" inputMode="decimal" value={fields.longitude} onChange={e => change('longitude', e.target.value)} /></label></div>
    <p aria-live="polite">{pin ? `Selected destination: ${pin[0]}, ${pin[1]}` : 'No destination pin selected.'}</p>
    <label className="block">Known access restrictions (optional, max 200)<textarea className={input} maxLength={200} value={fields.accessNote} onChange={e => change('accessNote', e.target.value)} /></label>
    <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={fields.accessConfirmed} onChange={e => change('accessConfirmed', e.target.checked)} /><span>I confirm this is appropriate to share and publicly accessible. Avoid private homes, trespass, bystanders and sensitive wildlife locations. This is separate from the post audience.</span></label>
    {message && <p role="alert" className="text-red-800">{message}</p>}
    {uncertain && <div className="rounded-xl border border-[var(--warning-text)] bg-[var(--warning-surface)] p-4 text-sm leading-6"><p className="font-semibold text-[var(--warning-text)]">Save outcome uncertain</p>{original ? <p>Inspect the existing spot before trying the edit again. A response timeout does not prove the edit failed. <a className="underline" href={`?spot=${original.id}`} target="_blank" rel="noopener noreferrer">Inspect existing spot in new tab</a></p> : <><p>Checking Connections separately from Public, which may omit your Connections-only or out-of-radius spot. A recent list read cannot prove a still-processing save failed; do not resubmit solely because it is absent.</p><p role="status" className="mt-2">{reconciliationStatus}</p><button className={`${button} mt-2`} type="button" onClick={() => void checkConnections()}>Check Connections again</button><ul className="mt-2 list-inside list-disc">{ownCandidates.map(spot => <li key={spot.id}>{spot.title} — {spot.createdAt} <a className="underline" href={`?spot=${spot.id}`} target="_blank" rel="noopener noreferrer">Inspect own spot in new tab</a></li>)}</ul></>}</div>}
    <div className="flex flex-wrap gap-3">
    <button className={`${button} ui-button-primary`} disabled={pending}>{pending ? 'Saving…' : original ? 'Save changes' : 'Share spot'}</button>
    <button type="button" className={button} disabled={pending} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}

function LiveWorkspace({ profile, recheck, scope, feed, onFeedChange }: Props & { scope: SpotScope }) {
  const [center, setCenter] = useState<Center | null>(pilotCenter)
  const [centerSource, setCenterSource] = useState<'pilot' | 'manual' | null>(pilotCenter ? 'pilot' : null)
  const [draftLat, setDraftLat] = useState(pilotCenter ? String(pilotCenter.latitude) : '')
  const [draftLon, setDraftLon] = useState(pilotCenter ? String(pilotCenter.longitude) : '')
  const [centerMessage, setCenterMessage] = useState('')
  const [centerLocationState, setCenterLocationState] = useState<SpotLocationState>({ kind: 'idle' })
  const centerLocation = useRef<SpotLocationController | null>(null)
  const [settings, setSettings] = useState(profile)
  const [radiusDraft, setRadiusDraft] = useState(String(profile.publicRadiusKm))
  const [radiusPending, setRadiusPending] = useState(false)
  const [radiusMessage, setRadiusMessage] = useState('')
  const [radiusError, setRadiusError] = useState('')
  const [spots, setSpots] = useState<Spot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listStatus, setListStatus] = useState('Loading Connections…')
  const [listPhase, setListPhase] = useState<'loading' | 'ready' | 'error' | 'blocked'>('loading')
  const [listKey, setListKey] = useState('')
  const resultsController = useRef(new ScopedResultsController())
  const [queryDraft, setQueryDraft] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement | null>(null)
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [queryError, setQueryError] = useState('')
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchRetry, setSearchRetry] = useState(0)
  const [mapOpen, setMapOpen] = useState(false)
  const [detail, setDetail] = useState<Spot | null>(null)
  const [detailStatus, setDetailStatus] = useState('')
  const [mode, setMode] = useState<'list' | 'detail' | 'add' | 'edit' | 'profile'>('list')
  const [cleanupId, setCleanupId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [revision, setRevision] = useState(0)
  const detailRevision = useRef(0)
  const refresh = () => setRevision(n => n + 1)
  if (!centerLocation.current) centerLocation.current = new SpotLocationController(() => navigator.geolocation, state => {
    setCenterLocationState(state)
     if (state.kind === 'success') {
       setDraftLat(state.latitude)
       setDraftLon(state.longitude)
       const next = normalizeCenter(Number(state.latitude), Number(state.longitude))
       if (next) {
         resultsController.current.invalidate()
         setCenter(next)
         setCenterSource('manual')
         setCenterMessage('Current location selected. Public spots are loading.')
       }
    }
  })
  useEffect(() => () => centerLocation.current?.dispose(), [])
  useEffect(() => { setSettings(profile); setRadiusDraft(String(profile.publicRadiusKm)) }, [profile.id, profile.displayName, profile.publicRadiusKm])
  const requestKey = JSON.stringify([profile.id, feed, center?.latitude, center?.longitude, settings.publicRadiusKm, revision, submittedQuery, searchRetry])
  const visibleSpots = listKey === requestKey ? spots : []
  const visibleStatus = listKey === requestKey ? listStatus : feed === 'public' && !center ? 'Choose and confirm a discovery center to browse or search Public spots.' : submittedQuery ? 'Searching spots…' : `Loading ${feed === 'public' ? 'Public' : 'Connections'}…`
  const visiblePhase = listKey === requestKey ? listPhase : feed === 'public' && !center ? 'blocked' : 'loading'
  const visibleSearchResult = listKey === requestKey ? searchResult : null
  const enteredCenter = normalizeCenter(draftLat.trim() ? Number(draftLat) : NaN, draftLon.trim() ? Number(draftLon) : NaN)
  const stagedCenter = enteredCenter && (!center || enteredCenter.latitude !== center.latitude || enteredCenter.longitude !== center.longitude) ? enteredCenter : null

  useEffect(() => { if (searchOpen) searchInput.current?.focus() }, [searchOpen])
  useEffect(() => { resultsController.current.invalidate(); back() }, [feed])

  useEffect(() => {
    setSpots([])
    setSearchResult(null)
    setListKey(requestKey)
    if (feed === 'public' && !center) { resultsController.current.invalidate(); setListPhase('blocked'); setListStatus('Choose and confirm a discovery center to browse or search Public spots.'); return }
    setListPhase('loading')
    setListStatus(submittedQuery ? 'Searching spots…' : `Loading ${feed === 'public' ? 'Public' : 'Connections'}…`)
    return resultsController.current.begin(requestKey, profile.id,
      async () => (await getSupabaseClient().auth.getSession()).data.session,
      async (token, signal) => submittedQuery
        ? searchSpots(apiBaseUrl, token, submittedQuery, feed, center, signal)
        : asSpots(await spotRequest(apiBaseUrl, token, spotsPath(feed, center ?? undefined), signal), apiBaseUrl, feed),
      event => {
        if (event.status === 'error') {
          setSpots([]); setSearchResult(null)
          setListPhase('error')
          if (event.error instanceof SearchApiError) {
            if (event.error.failure.kind === 'auth') recheck()
            setListStatus(event.error.failure.message)
          } else setListStatus(failure(event.error, recheck))
          return
        }
        setListPhase('ready')
        if (submittedQuery) {
          const result = event.value as SearchResult
          setSearchResult(result); setSpots(result.spots)
          setListStatus(result.spots.length ? `${result.spots.length} semantic ${result.spots.length === 1 ? 'match' : 'matches'}. Original member notes are shown.` :
            result.emptyReason === 'no_candidates' ? feed === 'public' ? 'No Public spots inside this radius to search. Adjust the radius in Profile or choose another center; the search is not widened.' : 'No spots from you or your connections to search yet.' : 'No semantic matches for this query among eligible spots. Try other words or browse instead.')
        } else {
          const rows = event.value as Spot[]
          setSpots(rows); setListStatus(rows.length ? '' : feed === 'public' ? 'No Public spots inside this radius. Adjust the radius in Profile or choose another center; the feed is not widened automatically.' : 'No spots from you or your connections yet.')
        }
      })
  }, [profile.id, feed, center, settings.publicRadiusKm, revision, recheck, requestKey, submittedQuery])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    try {
      const query = searchQuery(queryDraft)
      if (feed === 'public' && !center) { setQueryError('Confirm a discovery center before searching Public spots.'); return }
      setQueryError(''); resultsController.current.invalidate(); setSpots([]); setSearchResult(null)
      setSubmittedQuery(query); setSearchRetry(n => n + 1)
    } catch (error) { if (error instanceof SearchApiError) setQueryError(error.failure.message) }
  }
  function clearSearch() {
    resultsController.current.invalidate(); setSpots([]); setSearchResult(null)
    setQueryDraft(''); setSubmittedQuery(''); setQueryError(''); setSearchRetry(n => n + 1)
  }
  function retrySearch() { resultsController.current.invalidate(); setSpots([]); setSearchResult(null); setSearchRetry(n => n + 1) }

  function toggleMap() {
    if (mapOpen) { setMapOpen(false); return }
    setMapOpen(true)
    if (!center && !visibleSpots.length) centerLocation.current?.request()
  }

  function chooseCenter(event: FormEvent) {
    event.preventDefault()
    centerLocation.current?.cancel()
    const next = normalizeCenter(draftLat.trim() === '' ? NaN : Number(draftLat), draftLon.trim() === '' ? NaN : Number(draftLon))
    if (!next) { setCenterMessage('Enter finite latitude (-90 to 90) and longitude (-180 to 180).'); return }
    resultsController.current.invalidate()
    setCenterMessage('Manual discovery center confirmed. Map panning alone does not change it.')
    setCenterSource('manual'); setCenter(next)
  }

  async function submitRadius(event: FormEvent) {
    event.preventDefault()
    if (radiusPending) return
    const value = radiusValue(radiusDraft)
    if (value === null) { setRadiusError('Enter a whole-number radius from 1 to 25 km.'); setRadiusMessage(''); return }
    setRadiusPending(true); setRadiusError(''); setRadiusMessage('')
    try {
      const result = await scope.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session, (token, signal) => saveRadius(apiBaseUrl, token, profile.id, value, signal))
      if (result) { resultsController.current.invalidate(); setSettings(result); setRadiusDraft(String(result.publicRadiusKm)); setRadiusMessage(`Saved ${result.publicRadiusKm} km. Public results will refresh.`); refresh() }
    } catch (error) {
      if (error instanceof RadiusError) { if (error.kind === 'auth') recheck(); setRadiusError(error.message) }
      else setRadiusError('Radius save unavailable. Your previous saved radius remains displayed.')
    } finally { setRadiusPending(false) }
  }

  async function open(id: string) {
    const request = ++detailRevision.current
    if (!spotIdPattern.test(id)) { setDetail(null); setDetailStatus('Spot unavailable.'); setMode('detail'); return }
    setMode('detail'); setDetail(null); setDetailStatus('Loading spot…')
    try {
      const result = await scope.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session, async (token, signal) => asSpot(await spotRequest(apiBaseUrl, token, `/spots/${id}`, signal), apiBaseUrl))
      if (request === detailRevision.current && result) { setDetail(result); setDetailStatus('') }
    } catch (err) { if (request === detailRevision.current) { setDetail(null); setDetailStatus(failure(err, recheck)) } }
  }
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get('spot')
    if (id) void open(id)
    // URL is read once at mount; changing accounts remounts the workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const navigate = () => {
      const id = new URL(window.location.href).searchParams.get('spot')
      if (id) void open(id)
      else { detailRevision.current++; setMode('list'); setDetail(null); setDetailStatus('') }
    }
    window.addEventListener('popstate', navigate)
    return () => window.removeEventListener('popstate', navigate)
    // Fresh history navigation reads the URL, not a cached spot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function openDetail(id: string) {
    const url = new URL(window.location.href)
    url.searchParams.set('spot', id)
    window.history.pushState(null, '', url)
    void open(id)
  }
  function back() {
    detailRevision.current++
    const url = new URL(window.location.href)
    url.searchParams.delete('spot')
    window.history.replaceState(null, '', url)
    setMode('list'); setDetail(null); setDetailStatus('')
  }
  function exploredSpotMissing() {
    resultsController.current.invalidate()
    back()
    refresh()
    setDetailStatus('Spot unavailable.')
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this spot? It will become unavailable immediately. Photo cleanup may need a retry.')) return
    setBusyDelete(true); setDetailStatus('')
    try {
      const result = await scope.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session, (token, signal) => spotRequest(apiBaseUrl, token, `/spots/${id}`, signal, 'DELETE'))
       if (result === null) { resultsController.current.invalidate(); setCleanupId(null); setSpots(current => current.filter(s => s.id !== id)); back(); refresh() }
    } catch (err) {
      if (err instanceof SpotApiError && err.failure.kind === 'cleanup') {
         resultsController.current.invalidate(); back(); setCleanupId(id); setSpots(current => current.filter(s => s.id !== id)); refresh()
      }
      setDetailStatus(failure(err, recheck))
    } finally { setBusyDelete(false) }
  }

  function navigateTo(destination: 'list' | 'add' | 'profile') {
    back()
    setMode(destination)
  }

  return <section className="workspace-shell" aria-label="Spot workspace">
     <div className="workspace-heading">
       <div><p className="workspace-kicker">Discover</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.04em] text-[var(--forest-950)]">{mode === 'list' ? (feed === 'public' ? 'Public discoveries' : 'Your connections') : mode === 'profile' ? 'Your profile' : mode === 'detail' ? 'Spot detail' : mode === 'edit' ? 'Edit your spot' : 'Add a spot'}</h1></div>
       {mode === 'list' && <p className="hidden rounded-full bg-[var(--opal-100)] px-3 py-2 text-sm font-semibold text-[var(--forest-950)] lg:block">{visibleSpots.length ? `${visibleSpots.length} nearby` : 'Make time to notice'}</p>}
     </div>
    <nav className="workspace-nav" aria-label="Primary">
      <button type="button" className="nav-item" aria-current={mode === 'list' ? 'page' : undefined} onClick={() => navigateTo('list')}><ExploreIcon className="h-5 w-5" /><span>Discover</span></button>
      <button type="button" className="nav-item" aria-current={mode === 'add' || mode === 'edit' ? 'page' : undefined} onClick={() => navigateTo('add')}><PlusIcon className="h-5 w-5" /><span>Add spot</span></button>
      <button type="button" className="nav-item" aria-current={mode === 'profile' ? 'page' : undefined} onClick={() => navigateTo('profile')}><PersonIcon className="h-5 w-5" /><span>Profile</span></button>
    </nav>
       {mode === 'list' && <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">{feed === 'public' ? `Public posts within your saved ${settings.publicRadiusKm} km straight-line radius of the ${centerSource === 'pilot' ? 'configured pilot area' : centerSource === 'manual' ? 'chosen manual area' : 'center you choose'}. Distance is approximate, not travel time.` : 'Newest spots from you and your enrolled connections, including their Public posts.'} </p>}
      {mode === 'list' && <div className="mt-4 flex items-center gap-2">
        <form onSubmit={submitSearch} className="flex min-w-0 flex-1 items-center gap-2" role="search">
        <label className="sr-only" htmlFor="spot-query">Search spots</label>
        {!searchOpen ? <button type="button" className={`${button} shrink-0`} aria-label="Open search" title="Search spots" onClick={() => setSearchOpen(true)}><SearchIcon className="h-5 w-5" /></button> : <><div className="relative min-w-0 flex-1"><input ref={searchInput} id="spot-query" className={`${input} pr-12`} type="search" maxLength={200} placeholder="Search spots by meaning…" value={queryDraft} onChange={event => setQueryDraft(event.target.value)} />{<button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 ui-button min-h-12 w-12 rounded-xl" onClick={() => { if (queryDraft || submittedQuery) clearSearch(); else setSearchOpen(false) }} aria-label={queryDraft || submittedQuery ? 'Clear search' : 'Close search'} title={queryDraft || submittedQuery ? 'Clear search' : 'Close search'}><XIcon className="h-4 w-4" /></button>}</div><button type="submit" className={`${button} shrink-0`} aria-label="Submit search" title="Search"><SearchIcon className="h-5 w-5" /></button></>}
        </form>
        <button type="button" className={`${button} shrink-0`} aria-label={`Reload ${submittedQuery ? 'search' : feed === 'public' ? 'Public' : 'Connections'}`} title="Reload" onClick={() => { resultsController.current.invalidate(); refresh() }}><RefreshIcon className="h-5 w-5" /></button>
      </div>}
    {mode === 'list' && <>
          {queryError && <p role="alert" className="mt-4 text-red-800">{queryError}</p>}
        {submittedQuery && <h4 className="mt-4 font-semibold">Semantic matches <span className="text-sm font-normal">for your submitted query (up to 3, original member notes)</span></h4>}
        {feed === 'public' && <p className="mt-5 text-sm text-[var(--ink-muted)]">Tap the current-location button to load nearby Public spots.</p>}
        <div className="mt-5 flex items-center gap-2">
          <button type="button" className={button} onClick={toggleMap} aria-expanded={mapOpen} aria-controls="spot-map-view"><MapPinIcon className="h-5 w-5" />{mapOpen ? 'Hide map' : 'Explore with map'}</button>
          <button type="button" className={`${button} shrink-0`} disabled={centerLocationState.kind === 'pending'} onClick={() => centerLocation.current?.request()} aria-label={centerLocationState.kind === 'pending' ? 'Finding current location' : 'Use current location'} title={centerLocationState.kind === 'pending' ? 'Finding current location' : 'Use current location'}><LocateIcon className="h-5 w-5" /></button>
       </div>
         {mapOpen && <div id="spot-map-view" className="mt-4">{!center && !visibleSpots.length ? <p role="status">{centerLocationState.kind === 'pending' ? 'Finding your current location to open the map…' : centerLocationState.kind === 'permissionDenied' ? 'Location permission denied. Use the location button to retry.' : centerLocationState.kind === 'unsupported' ? 'This browser does not support location.' : centerLocationState.kind === 'unavailable' ? 'Location unavailable or timed out. Use the location button to retry.' : 'Finding your current location to open the map…'}</p> : <SpotMap center={feed === 'public' && center ? [center.latitude, center.longitude] : undefined} stagedCenter={feed === 'public' && stagedCenter ? [stagedCenter.latitude, stagedCenter.longitude] : undefined} viewCenter={feed === 'public' && stagedCenter ? [stagedCenter.latitude, stagedCenter.longitude] : feed === 'connections' && visibleSpots.length ? [visibleSpots[0].latitude, visibleSpots[0].longitude] : feed === 'connections' && center ? [center.latitude, center.longitude] : undefined} radiusKm={feed === 'public' && center ? settings.publicRadiusKm : undefined} spots={visibleSpots} selectedId={selectedId} onSelect={openDetail} onPick={feed === 'public' ? (lat, lon) => { const next = normalizeCenter(lat, lon); if (next) { setDraftLat(String(lat)); setDraftLon(String(lon)); setCenterMessage('Map center staged. Results still use the confirmed center until you confirm this one.') } } : undefined} />}</div>}
         {feed === 'public' && <form onSubmit={chooseCenter} className="surface card mt-4 space-y-3 p-4" aria-label="Confirm Public discovery center">
           <div><p className="font-semibold">Choose Public discovery area</p><p className="text-sm leading-6 text-[var(--ink-muted)]">Map clicks only stage a center. Public results stay on the confirmed area until you confirm.</p></div>
           <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Latitude<input className={input} type="number" min={-90} max={90} step="any" inputMode="decimal" value={draftLat} onChange={event => { setDraftLat(event.target.value); setCenterMessage('') }} /></label><label className="text-sm font-medium">Longitude<input className={input} type="number" min={-180} max={180} step="any" inputMode="decimal" value={draftLon} onChange={event => { setDraftLon(event.target.value); setCenterMessage('') }} /></label></div>
           <div className="flex flex-wrap items-center gap-3"><button type="submit" className={`${button} ui-button-primary`} disabled={!stagedCenter}>{stagedCenter ? 'Confirm discovery center' : 'Discovery center confirmed'}</button>{centerMessage && <p role="status" className="text-sm leading-6">{centerMessage}</p>}</div>
         </form>}
       {visibleStatus && <p role={visiblePhase === 'error' ? 'alert' : 'status'} className="mt-4">{visibleStatus}</p>}
       {submittedQuery && !visibleSearchResult && visiblePhase === 'error' && <button type="button" className={button} onClick={retrySearch}>Retry search</button>}
      {detailStatus && <p role="alert" className="mt-4 text-red-800">{detailStatus}</p>}
      {cleanupId && <p role="alert" className="mt-4">Spot is hidden, but photo cleanup is pending. <button className={button} disabled={busyDelete} onClick={() => void remove(cleanupId)}>Retry deletion</button></p>}
       <ul className="mt-5 grid gap-5 md:grid-cols-2">{visibleSpots.map(spot => <li key={spot.id} className="spot-card">
         <ProtectedPhoto spot={spot} scope={scope} profile={profile} recheck={recheck} />
         <div className="spot-card__body"><p className="eyebrow">{spot.audience === 'public' ? 'Public discovery' : 'Connections only'}</p><h4 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[var(--forest-950)]">{spot.title}</h4><p className="mt-2 whitespace-pre-wrap break-words leading-7 text-[var(--ink-muted)]">{spot.note.slice(0, 160)}{spot.note.length > 160 ? '…' : ''}</p>
         <p className="mt-3 text-sm text-[var(--ink-muted)]">{spot.authorName}{feed === 'public' && spot.distanceKm !== undefined ? ` · ${spot.distanceKm.toFixed(1)} km approx. straight-line` : ''}</p>
         <button className={`${button} mt-4 w-full`} onFocus={() => setSelectedId(spot.id)} onBlur={() => setSelectedId(null)} onMouseEnter={() => setSelectedId(spot.id)} onMouseLeave={() => setSelectedId(null)} onClick={() => openDetail(spot.id)}>Open spot</button></div>
       </li>)}</ul>
    </>}
      {mode === 'profile' && <div className="surface card mt-6 space-y-5 p-4 sm:p-6"><div><p className="workspace-kicker">Your settings</p><h4 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--forest-950)]">Profile</h4></div><div className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="text-sm text-[var(--ink-muted)]">Display name</p><p className="mt-1 font-semibold">{settings.displayName}</p><p className="mt-3 text-sm text-[var(--ink-muted)]">Saved Public discovery radius</p><p className="mt-1 font-semibold">{settings.publicRadiusKm} km</p></div><form onSubmit={e => void submitRadius(e)} className="space-y-4"><label className="field-label">Public discovery radius (1–25 km)<input className={input} type="number" min={1} max={25} step={1} inputMode="numeric" value={radiusDraft} disabled={radiusPending} onChange={e => setRadiusDraft(e.target.value)} /></label><p className="text-sm leading-6 text-[var(--ink-muted)]">Public discovery uses straight-line distance from the area you confirm. It does not track your live location.</p><button className={`${button} ui-button-primary`} disabled={radiusPending}><CheckIcon className="h-5 w-5" />{radiusPending ? 'Saving radius…' : 'Save radius'}</button></form>{radiusMessage && <p role="status" className="rounded-xl bg-[var(--opal-100)] p-3 text-sm">{radiusMessage}</p>}{radiusError && <p role="alert" className="rounded-xl bg-[var(--error-surface)] p-3 text-sm text-[var(--error-text)]">{radiusError} Saved value remains {settings.publicRadiusKm} km.</p>}</div>}
    {mode === 'detail' && <>
      {detailStatus && <p role="status" className="mt-4">{detailStatus}</p>}
       {detail && <article className="surface card mt-6 space-y-4 p-4 sm:p-6">
         <p className="eyebrow">{detail.audience === 'public' ? 'Public discovery' : 'Connections only'}</p><h4 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--forest-950)]">{detail.title}</h4>
        <ProtectedPhoto spot={detail} scope={scope} profile={profile} recheck={recheck} />
         <p className="whitespace-pre-wrap break-words leading-7">{detail.note}</p><p className="text-sm text-[var(--ink-muted)]">Shared by {detail.authorName} · {detail.audience === 'public' ? 'Public to enrolled pilot members' : 'Connections only'}</p>
          <div className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="flex items-center gap-2 font-semibold"><MapPinIcon className="h-5 w-5" />Access information</p><p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Poster confirmed public physical access; not independently verified. {detail.accessNote || 'No additional access restrictions supplied.'}</p></div>
          <details className="rounded-xl border border-[var(--line)] p-4"><summary className="flex cursor-pointer items-center gap-2 font-semibold"><MapPinIcon className="h-5 w-5" />Show destination map</summary><p className="mt-3 text-sm text-[var(--ink-muted)]">Destination: {detail.latitude}, {detail.longitude}</p><div className="mt-3"><SpotMap pin={[detail.latitude, detail.longitude]} /></div></details>
         <p className="text-sm leading-6 text-[var(--ink-muted)]">Directions open Google Maps outside this app and send it the destination coordinates. No safe route or travel time is verified.</p>
           <a className={`${button} ui-button-primary w-full sm:w-auto`} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${detail.latitude},${detail.longitude}`)}`}><DirectionsIcon className="h-5 w-5" />Open directions (external)</a>
          <ExploredControl key={`${profile.id}:${detail.id}`} memberId={profile.id} spotId={detail.id} recheck={recheck} onMissing={exploredSpotMissing} />
          <ReportControl key={`report:${profile.id}:${detail.id}`} memberId={profile.id} spotId={detail.id} recheck={recheck} onMissing={exploredSpotMissing} />
        {detail.ownerId === profile.id && <div className="flex gap-3"><button className={button} onClick={() => setMode('edit')}>Edit metadata</button><button className={button} disabled={busyDelete} onClick={() => void remove(detail.id)}>{busyDelete ? 'Deleting…' : 'Delete spot'}</button></div>}
      </article>}
    </>}
     {mode === 'add' && <Form scope={scope} profile={profile} recheck={recheck} initial={empty()} refresh={() => { resultsController.current.invalidate(); refresh() }} onCancel={back} onSaved={spot => { resultsController.current.invalidate(); refresh(); openDetail(spot.id) }} />}
     {mode === 'edit' && detail && <Form key={detail.id} scope={scope} profile={profile} recheck={recheck} original={detail} initial={{ title: detail.title, note: detail.note, audience: detail.audience, accessNote: detail.accessNote, accessConfirmed: true, latitude: String(detail.latitude), longitude: String(detail.longitude) }} refresh={() => { resultsController.current.invalidate(); refresh() }} onCancel={() => setMode('detail')} onSaved={spot => { resultsController.current.invalidate(); setDetail(spot); setMode('detail'); refresh() }} />}
  </section>
}

export function SpotWorkspace(props: Props) {
  const [scope, setScope] = useState<SpotScope | null>(null)
  useEffect(() => {
    const next = new SpotScope()
    setScope(next)
    return () => { next.dispose(); setScope(current => current === next ? null : current) }
  }, [props.profile.id])
  return scope && <LiveWorkspace {...props} scope={scope} />
}
