export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="loadbar" />
      <div className="skel mb-5 h-6 w-48" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card"><div className="skel mb-2 h-3 w-20" /><div className="skel h-6 w-14" /></div>)}
      </div>
      <div className="card space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel h-4 w-full" />)}</div>
    </div>
  );
}
