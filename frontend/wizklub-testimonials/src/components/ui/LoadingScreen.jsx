export default function LoadingScreen({ message = 'Loading…' }) {
  return (
    <div className="loading-screen">
      <div className="loading-screen__spinner" aria-hidden="true" />
      <p className="loading-screen__text">{message}</p>
    </div>
  )
}
