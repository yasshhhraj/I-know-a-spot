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

type Props = { profile: Profile; recheck: () => void }
const button = 'min-h-12 rounded-lg border border-stone-600 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50'
const input = 'mt-1 w-full rounded-lg border border-stone-500 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700'
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

  return <form onSubmit={e => void save(e)} className="mt-5 space-y-4" aria-label={original ? 'Edit spot' : 'Add a spot'}>
    <h3 className="text-xl font-semibold">{original ? 'Edit spot metadata' : 'Add a spot'}</h3>
    {!original && <>
      <p>One photo, up to 10 MiB: JPEG, PNG or WebP. HEIC and animated images are unsupported. The server checks actual bytes and removes metadata.</p>
      <div className="flex flex-wrap gap-3">
        <label className={button}>Take photo<input className="block max-w-48 text-sm" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectPhoto} disabled={pending} aria-label="Take photo with camera where supported" /></label>
        <label className={button}>Choose photo<input className="block max-w-48 text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={pending} aria-label="Choose a photo from device" /></label>
      </div>
      {preview && <img src={preview} alt="Selected photo preview" className="max-h-64 rounded-lg object-contain" />}
    </>}
    <label className="block font-medium">Title (1–80)<input className={input} value={fields.title} maxLength={80} required onChange={e => change('title', e.target.value)} /></label>
    <label className="block font-medium">Personal note (1–500)<textarea className={input} value={fields.note} maxLength={500} required rows={4} onChange={e => change('note', e.target.value)} /></label>
    <fieldset className="space-y-2"><legend className="font-medium">Audience</legend>
      <label className="block"><input type="radio" checked={fields.audience === 'connections'} onChange={() => change('audience', 'connections')} /> Connections only (default)</label>
      <label className="block"><input type="radio" checked={fields.audience === 'public'} onChange={() => change('audience', 'public')} /> Public</label>
      {fields.audience === 'public' && <p className="rounded-lg bg-amber-50 p-3 text-amber-950">Unfamiliar enrolled pilot members can discover this spot in Public and see your display name, photo, note and exact destination pin.</p>}
    </fieldset>
    <div><p className="font-medium">Destination pin (required)</p><p className="mb-2 text-sm">Map overview is not your current location. Tap/click the map to select a pin, enter coordinates below, or choose Use current location. Map tiles load from an external provider; location permission is requested only when you choose the button.</p>
      {!original && <><button type="button" className={`${button} mb-2`} disabled={locationState.kind === 'pending' || pending} onClick={() => location.current?.request()} aria-describedby="spot-location-status">{locationState.kind === 'pending' ? 'Finding location…' : 'Use current location'}</button>
        <p id="spot-location-status" role="status" className="mb-2 text-sm">{locationState.kind === 'pending' ? 'Waiting for your browser location. You can still select the map or enter coordinates manually.' : locationState.kind === 'success' ? 'Location filled in. Check the destination pin and edit coordinates if needed; nothing has been shared yet.' : locationState.kind === 'permissionDenied' ? 'Location permission denied. Change browser permissions to retry, or select the map or enter coordinates manually.' : locationState.kind === 'unsupported' ? 'This browser does not support location. Select the map or enter coordinates manually.' : locationState.kind === 'unavailable' ? 'Location unavailable or timed out. Retry with the button or select the map or enter coordinates manually.' : 'Optional: use your location for this destination pin, or select the map or enter coordinates manually.'}</p></>}
      <SpotMap pin={pin} worldPicker onPick={(lat, lng) => { location.current?.cancel(); setFields(current => ({ ...current, latitude: lat.toFixed(6), longitude: lng.toFixed(6) })) }} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><label>Latitude (-90 to 90)<input className={input} type="number" min={-90} max={90} step="any" inputMode="decimal" value={fields.latitude} onChange={e => change('latitude', e.target.value)} /></label><label>Longitude (-180 to 180)<input className={input} type="number" min={-180} max={180} step="any" inputMode="decimal" value={fields.longitude} onChange={e => change('longitude', e.target.value)} /></label></div>
    <p aria-live="polite">{pin ? `Selected destination: ${pin[0]}, ${pin[1]}` : 'No destination pin selected.'}</p>
    <label className="block">Known access restrictions (optional, max 200)<textarea className={input} maxLength={200} value={fields.accessNote} onChange={e => change('accessNote', e.target.value)} /></label>
    <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={fields.accessConfirmed} onChange={e => change('accessConfirmed', e.target.checked)} /><span>I confirm this is appropriate to share and publicly accessible. Avoid private homes, trespass, bystanders and sensitive wildlife locations. This is separate from the post audience.</span></label>
    {message && <p role="alert" className="text-red-800">{message}</p>}
    {uncertain && <div className="rounded-lg border border-amber-700 p-3"><p className="font-semibold">Save outcome uncertain</p>{original ? <p>Inspect the existing spot before trying the edit again. A response timeout does not prove the edit failed. <a className="underline" href={`?spot=${original.id}`} target="_blank" rel="noopener noreferrer">Inspect existing spot in new tab</a></p> : <><p>Checking Connections separately from Public, which may omit your Connections-only or out-of-radius spot. A recent list read cannot prove a still-processing save failed; do not resubmit solely because it is absent.</p><p role="status" className="mt-2">{reconciliationStatus}</p><button className={`${button} mt-2`} type="button" onClick={() => void checkConnections()}>Check Connections again</button><ul className="mt-2 list-inside list-disc">{ownCandidates.map(spot => <li key={spot.id}>{spot.title} — {spot.createdAt} <a className="underline" href={`?spot=${spot.id}`} target="_blank" rel="noopener noreferrer">Inspect own spot in new tab</a></li>)}</ul></>}</div>}
    <div className="flex flex-wrap gap-3">
    <button className={`${button} bg-emerald-800 text-white`} disabled={pending}>{pending ? 'Saving…' : original ? 'Save changes' : 'Share spot'}</button>
    <button type="button" className={button} disabled={pending} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}

function LiveWorkspace({ profile, recheck, scope }: Props & { scope: SpotScope }) {
  const [feed, setFeed] = useState<Audience>('connections')
  const [center, setCenter] = useState<Center | null>(pilotCenter)
  const [centerSource, setCenterSource] = useState<'pilot' | 'manual' | null>(pilotCenter ? 'pilot' : null)
  const [draftLat, setDraftLat] = useState(pilotCenter ? String(pilotCenter.latitude) : '')
  const [draftLon, setDraftLon] = useState(pilotCenter ? String(pilotCenter.longitude) : '')
  const [centerMessage, setCenterMessage] = useState('')
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
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [queryError, setQueryError] = useState('')
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchRetry, setSearchRetry] = useState(0)
  const [detail, setDetail] = useState<Spot | null>(null)
  const [detailStatus, setDetailStatus] = useState('')
  const [mode, setMode] = useState<'list' | 'detail' | 'add' | 'edit' | 'profile'>('list')
  const [cleanupId, setCleanupId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [revision, setRevision] = useState(0)
  const detailRevision = useRef(0)
  const refresh = () => setRevision(n => n + 1)
  useEffect(() => { setSettings(profile); setRadiusDraft(String(profile.publicRadiusKm)) }, [profile.id, profile.displayName, profile.publicRadiusKm])
  const requestKey = JSON.stringify([profile.id, feed, center?.latitude, center?.longitude, settings.publicRadiusKm, revision, submittedQuery, searchRetry])
  const visibleSpots = listKey === requestKey ? spots : []
  const visibleStatus = listKey === requestKey ? listStatus : feed === 'public' && !center ? 'Choose and confirm a discovery center to browse or search Public spots.' : submittedQuery ? 'Searching spots…' : `Loading ${feed === 'public' ? 'Public' : 'Connections'}…`
  const visiblePhase = listKey === requestKey ? listPhase : feed === 'public' && !center ? 'blocked' : 'loading'
  const visibleSearchResult = listKey === requestKey ? searchResult : null
  const enteredCenter = normalizeCenter(draftLat.trim() ? Number(draftLat) : NaN, draftLon.trim() ? Number(draftLon) : NaN)
  const stagedCenter = enteredCenter && (!center || enteredCenter.latitude !== center.latitude || enteredCenter.longitude !== center.longitude) ? enteredCenter : null

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

  function chooseCenter(event: FormEvent) {
    event.preventDefault()
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

  return <section className="mt-8 border-t border-stone-300 pt-6" aria-label="Spot workspace">
    <div className="flex justify-center"><div role="group" aria-label="Discovery feed" className="inline-flex rounded-lg border border-emerald-800 p-1">
       {(['connections', 'public'] as const).map(value => <button key={value} type="button" aria-pressed={feed === value} className={`${button} border-0 ${feed === value ? 'bg-emerald-800 text-white' : 'bg-white'}`} onClick={() => { if (feed !== value) { resultsController.current.invalidate(); back(); setFeed(value) } }}>{value === 'public' ? 'Public' : 'Connections'}</button>)}
    </div></div>
    <h3 className="mt-4 text-xl font-semibold">{feed === 'public' ? 'Public discoveries' : 'Connections'}</h3>
      <p className="mt-2 text-sm">{feed === 'public' ? `Public posts within your saved ${settings.publicRadiusKm} km straight-line radius of the ${centerSource === 'pilot' ? 'configured pilot area' : centerSource === 'manual' ? 'chosen manual area' : 'center you choose'}. Distance is approximate, not travel time.` : 'Newest spots from you and your enrolled connections, including their Public posts.'} The server determines eligibility; client display filtering is not authorization.</p>
    {mode === 'list' && <>
      {feed === 'public' && <div className="mt-4 rounded-lg border border-stone-300 p-3">
        <h4 className="font-semibold">Discovery center</h4>
        <p className="text-sm">{center ? `${centerSource === 'pilot' ? 'Configured pilot area' : 'Manually chosen area'}: ${center.latitude}, ${center.longitude}. Not your current location. Map panning does not change discovery.` : 'No pilot area is configured. Choose and confirm a manual center below (or ask the operator to configure a labelled pilot center). No device location is requested.'}</p>
        <form onSubmit={chooseCenter} className="mt-3 space-y-2"><div className="grid gap-3 sm:grid-cols-2"><label>Center latitude (-90 to 90)<input className={input} type="number" inputMode="decimal" min={-90} max={90} step="any" value={draftLat} onChange={e => setDraftLat(e.target.value)} /></label><label>Center longitude (-180 to 180)<input className={input} type="number" inputMode="decimal" min={-180} max={180} step="any" value={draftLon} onChange={e => setDraftLon(e.target.value)} /></label></div>
          <button type="submit" className={button}>Confirm discovery center</button>
        </form>
         {pilotCenter && centerSource !== 'pilot' && <button type="button" className={`${button} mt-2`} onClick={() => { const fallback = pilotCenter; if (!fallback) return; resultsController.current.invalidate(); setCenter(fallback); setCenterSource('pilot'); setDraftLat(String(fallback.latitude)); setDraftLon(String(fallback.longitude)); setCenterMessage('Configured pilot area restored.') }}>Use configured pilot area</button>}
        {centerMessage && <p role="status" className="mt-2">{centerMessage}</p>}
        <p className="mt-2 text-sm">Enter approximate coordinates to display the map, or tap it to stage a center; confirm before Public results change. Numeric entry works without map tiles.</p>
       </div>}
       <form onSubmit={submitSearch} className="mt-4 space-y-2" role="search">
         <label className="block font-medium" htmlFor="spot-query">Find spots by meaning (max 200 characters)</label>
         <input id="spot-query" className={input} type="search" value={queryDraft} onChange={e => setQueryDraft(e.target.value)} aria-describedby="search-help" />
         <p id="search-help" className="text-sm">Submit to search the selected feed. Changing this draft does not update results until you select Find spots.</p>
         <div className="flex flex-wrap gap-2"><button type="submit" className={`${button} bg-emerald-800 text-white`}>Find spots</button><button type="button" className={button} onClick={clearSearch}>Clear search / Browse instead</button></div>
         {queryError && <p role="alert" className="text-red-800">{queryError}</p>}
       </form>
       {submittedQuery && <h4 className="mt-4 font-semibold">Semantic matches <span className="text-sm font-normal">for your submitted query (up to 3, original member notes)</span></h4>}
       <div className="mt-4 flex flex-wrap gap-2"><button className={`${button} bg-emerald-800 text-white`} onClick={() => setMode('add')}>Add a spot</button>
       <button className={button} onClick={() => { resultsController.current.invalidate(); refresh() }}>Reload {submittedQuery ? 'search' : feed === 'public' ? 'Public' : 'Connections'}</button>
      <button className={button} onClick={() => setMode('profile')}>Profile &amp; radius</button></div>
      <div className="mt-4"><SpotMap center={feed === 'public' && center ? [center.latitude, center.longitude] : undefined} stagedCenter={feed === 'public' && stagedCenter ? [stagedCenter.latitude, stagedCenter.longitude] : undefined} viewCenter={feed === 'public' && stagedCenter ? [stagedCenter.latitude, stagedCenter.longitude] : feed === 'connections' && visibleSpots.length ? [visibleSpots[0].latitude, visibleSpots[0].longitude] : undefined} radiusKm={feed === 'public' && center ? settings.publicRadiusKm : undefined} spots={visibleSpots} selectedId={selectedId} onSelect={openDetail} onPick={feed === 'public' ? (lat, lon) => { const next = normalizeCenter(lat, lon); if (next) { setDraftLat(String(lat)); setDraftLon(String(lon)); setCenterMessage('Map center staged. Results still use the confirmed center until you confirm this one.') } } : undefined} /></div>
       {visibleStatus && <p role={visiblePhase === 'error' ? 'alert' : 'status'} className="mt-4">{visibleStatus}</p>}
       {submittedQuery && !visibleSearchResult && visiblePhase === 'error' && <button type="button" className={button} onClick={retrySearch}>Retry search</button>}
      {detailStatus && <p role="alert" className="mt-4 text-red-800">{detailStatus}</p>}
      {cleanupId && <p role="alert" className="mt-4">Spot is hidden, but photo cleanup is pending. <button className={button} disabled={busyDelete} onClick={() => void remove(cleanupId)}>Retry deletion</button></p>}
      <ul className="mt-4 space-y-4">{visibleSpots.map(spot => <li key={spot.id} className="rounded-lg border border-stone-300 p-3">
        <ProtectedPhoto spot={spot} scope={scope} profile={profile} recheck={recheck} />
        <h4 className="mt-2 font-semibold">{spot.title}</h4><p className="whitespace-pre-wrap break-words">{spot.note.slice(0, 160)}{spot.note.length > 160 ? '…' : ''}</p>
        <p className="text-sm">{spot.authorName} · {spot.audience === 'public' ? 'Public' : 'Connections only'}{feed === 'public' && spot.distanceKm !== undefined ? ` · ${spot.distanceKm.toFixed(1)} km approx. straight-line` : ''}</p>
        <button className={`${button} mt-2`} onFocus={() => setSelectedId(spot.id)} onBlur={() => setSelectedId(null)} onMouseEnter={() => setSelectedId(spot.id)} onMouseLeave={() => setSelectedId(null)} onClick={() => openDetail(spot.id)}>Open spot</button>
      </li>)}</ul>
    </>}
    {mode === 'profile' && <div className="mt-4 space-y-3"><button className={button} onClick={() => setMode('list')}>Back to {feed === 'public' ? 'Public' : 'Connections'}</button><h4 className="text-xl font-semibold">Profile</h4><p>Display name (fixed): {settings.displayName}</p><p>Saved Public discovery radius: {settings.publicRadiusKm} km</p><form onSubmit={e => void submitRadius(e)} className="space-y-3"><label className="block">Public discovery radius (1–25 km)<input className={input} type="number" min={1} max={25} step={1} inputMode="numeric" value={radiusDraft} disabled={radiusPending} onChange={e => setRadiusDraft(e.target.value)} /></label><button className={`${button} bg-emerald-800 text-white`} disabled={radiusPending}>{radiusPending ? 'Saving radius…' : 'Save radius'}</button></form>{radiusMessage && <p role="status">{radiusMessage}</p>}{radiusError && <p role="alert" className="text-red-800">{radiusError} Saved value remains {settings.publicRadiusKm} km.</p>}</div>}
    {mode === 'detail' && <>
      <button className={button} onClick={back}>Back to {feed === 'public' ? 'Public' : 'Connections'}</button>
      {detailStatus && <p role="status" className="mt-4">{detailStatus}</p>}
      {detail && <article className="mt-4 space-y-3">
        <h4 className="text-2xl font-semibold">{detail.title}</h4>
        <ProtectedPhoto spot={detail} scope={scope} profile={profile} recheck={recheck} />
        <p className="whitespace-pre-wrap break-words">{detail.note}</p><p>Shared by {detail.authorName} · {detail.audience === 'public' ? 'Public to enrolled pilot members' : 'Connections only'}</p>
        <p>Poster confirmed public physical access; not independently verified. {detail.accessNote || 'No additional access restrictions supplied.'}</p>
        <p>Destination: {detail.latitude}, {detail.longitude}</p><SpotMap pin={[detail.latitude, detail.longitude]} />
        <p className="text-sm">Directions open Google Maps outside this app and send it the destination coordinates. No safe route or travel time is verified.</p>
         <a className={`${button} inline-flex items-center`} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${detail.latitude},${detail.longitude}`)}`}>Open directions (external)</a>
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
