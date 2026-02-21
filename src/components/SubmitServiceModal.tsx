'use client'

import { useState } from 'react'

interface SubmitServiceModalProps {
  initialName: string
  onClose: () => void
}

export default function SubmitServiceModal({ initialName, onClose }: SubmitServiceModalProps) {
  const [serviceName, setServiceName] = useState(initialName)
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!serviceName.trim()) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/submit-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_name: serviceName,
          url: url || undefined,
          email: email || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Something went wrong')
        setSubmitting(false)
        return
      }

      setSubmitted(true)
      setTimeout(onClose, 2000)
    } catch {
      setError('Failed to submit. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-sm flex items-center justify-center p-5 animate-[fadeIn_0.3s]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl max-w-[440px] w-full shadow-2xl max-md:max-w-full max-md:rounded-xl">
        {submitted ? (
          <div className="p-7 text-center">
            <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-fabric-800 mb-1">Request submitted</h3>
            <p className="font-mono text-[0.72rem] text-fabric-400">We&apos;ll review and index this service soon.</p>
          </div>
        ) : (
          <>
            <div className="p-7 pb-0">
              <h2 className="text-base font-bold tracking-tight">Request a service</h2>
              <p className="font-mono text-[0.68rem] text-fabric-400 mt-1">
                Can&apos;t find what you&apos;re looking for? Let us know and we&apos;ll index it.
              </p>
            </div>

            <div className="p-7 pt-5 flex flex-col gap-3.5">
              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Service name <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value)}
                  placeholder="e.g. Acme AI"
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgba(254,131,224,0.1)]"
                />
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  URL <span className="font-mono text-[0.58rem] text-fabric-300">(optional)</span>
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgba(254,131,224,0.1)]"
                />
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Your email <span className="font-mono text-[0.58rem] text-fabric-300">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgba(254,131,224,0.1)]"
                />
              </div>

              {error && (
                <p className="font-mono text-[0.68rem] text-red">{error}</p>
              )}

              <button
                disabled={!serviceName.trim() || submitting}
                onClick={handleSubmit}
                className="w-full py-3 border-none rounded-[10px] font-sans text-sm font-semibold cursor-pointer transition-all bg-fabric-800 text-white hover:bg-black disabled:opacity-35 disabled:cursor-not-allowed mt-1"
              >
                {submitting ? 'Submitting...' : 'Submit request'}
              </button>

              <button
                onClick={onClose}
                className="w-full py-2 bg-transparent border-none text-fabric-400 font-mono text-[0.68rem] cursor-pointer hover:text-fabric-600"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
