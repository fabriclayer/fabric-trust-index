'use client'

import { useState } from 'react'

interface ClaimProviderModalProps {
  serviceName: string
  serviceSlug: string
  onClose: () => void
}

export default function ClaimProviderModal({ serviceName, serviceSlug, onClose }: ClaimProviderModalProps) {
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [role, setRole] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!contactName.trim() || !contactEmail.trim()) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/claim-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_slug: serviceSlug,
          service_name: serviceName,
          contact_name: contactName,
          contact_email: contactEmail,
          role: role || undefined,
          message: message || undefined,
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
            <h3 className="text-base font-semibold text-fabric-800 mb-1">Claim submitted</h3>
            <p className="font-mono text-[0.72rem] text-fabric-400">We&apos;ll review your claim and get back to you.</p>
          </div>
        ) : (
          <>
            <div className="p-7 pb-0">
              <h2 className="text-base font-bold tracking-tight">Claim {serviceName}</h2>
              <p className="font-mono text-[0.68rem] text-fabric-400 mt-1">
                Verify your ownership to unlock monitoring, deeper evaluation, and trust signals.
              </p>
            </div>

            <div className="p-7 pt-5 flex flex-col gap-3.5">
              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Service
                </label>
                <input
                  type="text"
                  value={serviceName}
                  disabled
                  className="w-full py-2 px-3.5 bg-fabric-100 border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Your name <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgba(254,131,224,0.1)]"
                />
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Email <span className="text-red">*</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgba(254,131,224,0.1)]"
                />
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Role <span className="font-mono text-[0.58rem] text-fabric-300">(optional)</span>
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  placeholder="e.g. CTO, Developer Relations"
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgba(254,131,224,0.1)]"
                />
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Message <span className="font-mono text-[0.58rem] text-fabric-300">(optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Any details that help verify your affiliation"
                  rows={3}
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgba(254,131,224,0.1)] resize-none"
                />
              </div>

              {error && (
                <p className="font-mono text-[0.68rem] text-red">{error}</p>
              )}

              <button
                disabled={!contactName.trim() || !contactEmail.trim() || submitting}
                onClick={handleSubmit}
                className="w-full py-3 border-none rounded-[10px] font-sans text-sm font-semibold cursor-pointer transition-all bg-fabric-800 text-white hover:bg-black disabled:opacity-35 disabled:cursor-not-allowed mt-1"
              >
                {submitting ? 'Submitting...' : 'Submit claim'}
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
