import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Profile } from './api'
import { getSupabaseClient } from './supabase'
import { apiBaseUrl } from './config'
import { SpotMap } from './SpotMap'
import { SpotScope } from './spotScope'
import { asSpot, asSpots, multipart, photoEndpoint, spotIdPattern, spotRequest, SpotApiError, validateData, validatePhoto, type Audience, type Spot, type SpotData } from './spotApi'

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

function Form({ initial, original, scope, profile, recheck, onSaved, onCancel, refresh, recentSpots, listStatus }: {
  initial: FormState; original?: Spot; scope: SpotScope; profile: Profile; recheck: () => void;
  onSaved: (spot: Spot) => void; onCancel: () => void; refresh: () => void; recentSpots: Spot[]; listStatus: string
}) {
  const [fields, setFields] = useState(initial)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = scope.track(file)
    setPreview(url)
    return () => scope.revoke(url)
  }, [file, scope])
  const change = (name: keyof FormState, value: string | boolean) => setFields(current => ({ ...current, [name]: value }))
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

  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const data = { ...fields, latitude: fields.latitude.trim() === '' ? NaN : Number(fields.latitude), longitude: fields.longitude.trim() === '' ? NaN : Number(fields.longitude) }
    const problem = validateData(data) || (!original && validatePhoto(file))
    if (problem) { setMessage(problem); return }
    const validated = data as SpotData
    setPending(true); setMessage(''); setUncertain(false)
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
      if (err instanceof SpotApiError && err.failure.kind === 'uncertain') { setUncertain(true); refresh() }
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
      {fields.audience === 'public' && <p className="rounded-lg bg-amber-50 p-3 text-amber-950">Unfamiliar enrolled pilot members can open this spot by ID and see your display name, photo, note and exact destination pin. Public discovery is not yet available here.</p>}
    </fieldset>
    <div><p className="font-medium">Destination pin (required)</p><p className="mb-2 text-sm">Map overview is not your current location. Tap/click the map to select a pin, or enter coordinates below. Map tiles load from an external provider; no location permission is requested.</p><SpotMap pin={pin} onPick={(lat, lng) => setFields(current => ({ ...current, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><label>Latitude (-90 to 90)<input className={input} type="number" min={-90} max={90} step="any" inputMode="decimal" value={fields.latitude} onChange={e => change('latitude', e.target.value)} /></label><label>Longitude (-180 to 180)<input className={input} type="number" min={-180} max={180} step="any" inputMode="decimal" value={fields.longitude} onChange={e => change('longitude', e.target.value)} /></label></div>
    <p aria-live="polite">{pin ? `Selected destination: ${pin[0]}, ${pin[1]}` : 'No destination pin selected.'}</p>
    <label className="block">Known access restrictions (optional, max 200)<textarea className={input} maxLength={200} value={fields.accessNote} onChange={e => change('accessNote', e.target.value)} /></label>
    <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={fields.accessConfirmed} onChange={e => change('accessConfirmed', e.target.checked)} /><span>I confirm this is appropriate to share and publicly accessible. Avoid private homes, trespass, bystanders and sensitive wildlife locations. This is separate from the post audience.</span></label>
    {message && <p role="alert" className="text-red-800">{message}</p>}
    {uncertain && <div className="rounded-lg border border-amber-700 p-3"><p className="font-semibold">Before submitting again:</p><ol className="list-inside list-decimal"><li>Wait for the connections preview to reload.</li><li>Check for a new spot with your title and photo.</li><li>If present, open it to confirm. If not, you can explicitly resubmit this preserved form.</li></ol><p role="status">{listStatus}</p><ul className="mt-2 list-inside list-disc">{recentSpots.map(spot => <li key={spot.id}>{spot.title} — {spot.createdAt} <a className="underline" href={`?spot=${spot.id}`} target="_blank" rel="noopener noreferrer">Inspect in new tab</a></li>)}</ul></div>}
    <div className="flex flex-wrap gap-3">
    <button className={`${button} bg-emerald-800 text-white`} disabled={pending}>{pending ? 'Saving…' : original ? 'Save changes' : 'Share spot'}</button>
    <button type="button" className={button} disabled={pending} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}

function LiveWorkspace({ profile, recheck, scope }: Props & { scope: SpotScope }) {
  const [spots, setSpots] = useState<Spot[]>([])
  const [listStatus, setListStatus] = useState('Loading connections preview…')
  const [detail, setDetail] = useState<Spot | null>(null)
  const [detailStatus, setDetailStatus] = useState('')
  const [mode, setMode] = useState<'list' | 'detail' | 'add' | 'edit'>('list')
  const [cleanupId, setCleanupId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [revision, setRevision] = useState(0)
  const detailRevision = useRef(0)
  const refresh = () => setRevision(n => n + 1)

  useEffect(() => {
    let active = true
    setListStatus('Loading connections preview…')
    void scope.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session, async (token, signal) => asSpots(await spotRequest(apiBaseUrl, token, '/spots', signal), apiBaseUrl)).then(result => {
      if (!active || !result) return
      setSpots(result); setListStatus(result.length ? '' : 'No spots from you or your connections yet.')
    }).catch(err => { if (active) { setSpots([]); setListStatus(failure(err, recheck)) } })
    return () => { active = false }
  }, [profile.id, scope, revision, recheck])

  async function open(id: string) {
    const request = ++detailRevision.current
    if (!spotIdPattern.test(id)) { setDetailStatus('Spot unavailable.'); setMode('detail'); return }
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
  async function remove(id: string) {
    if (!window.confirm('Delete this spot? It will become unavailable immediately. Photo cleanup may need a retry.')) return
    setBusyDelete(true); setDetailStatus('')
    try {
      const result = await scope.run(profile.id, async () => (await getSupabaseClient().auth.getSession()).data.session, (token, signal) => spotRequest(apiBaseUrl, token, `/spots/${id}`, signal, 'DELETE'))
      if (result === null) { setCleanupId(null); setSpots(current => current.filter(s => s.id !== id)); back(); refresh() }
    } catch (err) {
      if (err instanceof SpotApiError && err.failure.kind === 'cleanup') {
        back(); setCleanupId(id); setSpots(current => current.filter(s => s.id !== id)); refresh()
      }
      setDetailStatus(failure(err, recheck))
    } finally { setBusyDelete(false) }
  }

  return <section className="mt-8 border-t border-stone-300 pt-6" aria-label="Spot workspace">
    <h3 className="text-xl font-semibold">Connections preview</h3>
    <p className="mt-2 text-sm">Newest 50 spots from you and enrolled connections, including their Public posts. This is not the Public radius feed. Server authorization controls direct spot and photo requests; this screen is not an access rule.</p>
    {mode === 'list' && <>
      <button className={`${button} mt-4 bg-emerald-800 text-white`} onClick={() => setMode('add')}>Add a spot</button>
      <button className={`${button} ml-2 mt-4`} onClick={refresh}>Reload preview</button>
      {listStatus && <p role="status" className="mt-4">{listStatus}</p>}
      {detailStatus && <p role="alert" className="mt-4 text-red-800">{detailStatus}</p>}
      {cleanupId && <p role="alert" className="mt-4">Spot is hidden, but photo cleanup is pending. <button className={button} disabled={busyDelete} onClick={() => void remove(cleanupId)}>Retry deletion</button></p>}
      <ul className="mt-4 space-y-4">{spots.map(spot => <li key={spot.id} className="rounded-lg border border-stone-300 p-3">
        <ProtectedPhoto spot={spot} scope={scope} profile={profile} recheck={recheck} />
        <h4 className="mt-2 font-semibold">{spot.title}</h4><p className="whitespace-pre-wrap break-words">{spot.note.slice(0, 160)}{spot.note.length > 160 ? '…' : ''}</p>
        <p className="text-sm">{spot.authorName} · {spot.audience === 'public' ? 'Public' : 'Connections only'}</p>
        <button className={`${button} mt-2`} onClick={() => openDetail(spot.id)}>Open spot</button>
      </li>)}</ul>
    </>}
    {mode === 'detail' && <>
      <button className={button} onClick={back}>Back to preview</button>
      {detailStatus && <p role="status" className="mt-4">{detailStatus}</p>}
      {detail && <article className="mt-4 space-y-3">
        <h4 className="text-2xl font-semibold">{detail.title}</h4>
        <ProtectedPhoto spot={detail} scope={scope} profile={profile} recheck={recheck} />
        <p className="whitespace-pre-wrap break-words">{detail.note}</p><p>Shared by {detail.authorName} · {detail.audience === 'public' ? 'Public to enrolled pilot members' : 'Connections only'}</p>
        <p>Poster confirmed public physical access; not independently verified. {detail.accessNote || 'No additional access restrictions supplied.'}</p>
        <p>Destination: {detail.latitude}, {detail.longitude}</p><SpotMap pin={[detail.latitude, detail.longitude]} />
        <p className="text-sm">Directions open Google Maps outside this app and send it the destination coordinates. No safe route or travel time is verified.</p>
        <a className={`${button} inline-flex items-center`} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${detail.latitude},${detail.longitude}`)}`}>Open directions (external)</a>
        {detail.ownerId === profile.id && <div className="flex gap-3"><button className={button} onClick={() => setMode('edit')}>Edit metadata</button><button className={button} disabled={busyDelete} onClick={() => void remove(detail.id)}>{busyDelete ? 'Deleting…' : 'Delete spot'}</button></div>}
      </article>}
    </>}
    {mode === 'add' && <Form scope={scope} profile={profile} recheck={recheck} initial={empty()} refresh={refresh} recentSpots={spots} listStatus={listStatus} onCancel={back} onSaved={spot => { setSpots(current => [spot, ...current.filter(s => s.id !== spot.id)]); refresh(); openDetail(spot.id) }} />}
    {mode === 'edit' && detail && <Form key={detail.id} scope={scope} profile={profile} recheck={recheck} original={detail} initial={{ title: detail.title, note: detail.note, audience: detail.audience, accessNote: detail.accessNote, accessConfirmed: true, latitude: String(detail.latitude), longitude: String(detail.longitude) }} refresh={refresh} recentSpots={spots} listStatus={listStatus} onCancel={() => setMode('detail')} onSaved={spot => { setDetail(spot); setSpots(current => current.map(s => s.id === spot.id ? spot : s)); setMode('detail'); refresh() }} />}
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
