import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-fabric-50">
      <div className="text-center px-6">
        <p className="font-mono text-sm text-fabric-400 mb-2">404</p>
        <h1 className="text-2xl font-bold text-fabric-800 tracking-tight mb-2">
          Page not found
        </h1>
        <p className="text-fabric-500 text-sm mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block font-mono text-xs bg-fabric-800 text-white px-5 py-2.5 rounded-lg hover:bg-black transition-colors"
        >
          Back to Trust Index
        </Link>
      </div>
    </div>
  )
}
