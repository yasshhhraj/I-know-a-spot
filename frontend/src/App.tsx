export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12 text-stone-900">
      <p className="mb-3 text-sm font-semibold tracking-widest text-emerald-800 uppercase">
        I Know a Spot
      </p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Frontend scaffold only</h1>
      <p className="mt-5 text-base leading-relaxed text-stone-700">
        A mobile web starting point for sharing overlooked places. No sign-in, feeds,
        map, photo sharing, or AI discovery is implemented yet.
      </p>
      <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-950">
        This page does not load spots or contact the API. See the frontend README to
        configure the local backend and public Supabase values for later work.
      </p>
    </main>
  )
}
