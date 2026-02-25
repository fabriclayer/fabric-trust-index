'use client'

import { useState } from 'react'

interface ReportIssueModalProps {
  serviceName: string
  serviceSlug: string
  onClose: () => void
}

const ISSUE_TYPES = [
  { value: 'incorrect_score', label: 'Incorrect score' },
  { value: 'incorrect_info', label: 'Incorrect info' },
  { value: 'security_concern', label: 'Security concern' },
  { value: 'other', label: 'Other' },
]

export default function ReportIssueModal({ serviceName, serviceSlug, onClose }: ReportIssueModalProps) {
  const [issueType, setIssueType] = useState('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!issueType || !description.trim()) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_slug: serviceSlug,
          service_name: serviceName,
          issue_type: issueType,
          description,
          contact_email: contactEmail || undefined,
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
            <h3 className="text-base font-semibold text-fabric-800 mb-1">Report submitted</h3>
            <p className="font-mono text-[0.72rem] text-fabric-400">Thanks for letting us know. We&apos;ll review this shortly.</p>
          </div>
        ) : (
          <>
            <div className="p-7 pb-0">
              <h2 className="text-base font-bold tracking-tight">Report an issue</h2>
              <p className="font-mono text-[0.68rem] text-fabric-400 mt-1">
                Found something wrong with {serviceName}? Let us know.
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
                  Issue type <span className="text-red">*</span>
                </label>
                <select
                  value={issueType}
                  onChange={e => setIssueType(e.target.value)}
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 transition-all focus:outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(61,138,247,0.1)] appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a09c' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="" disabled>Select an issue type</option>
                  {ISSUE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Description <span className="text-red">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the issue in detail"
                  rows={3}
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(61,138,247,0.1)] resize-none"
                />
              </div>

              <div>
                <label className="font-mono text-[0.62rem] text-fabric-500 uppercase tracking-[0.04em] mb-1.5 block">
                  Your email <span className="font-mono text-[0.58rem] text-fabric-300">(optional)</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full py-2 px-3.5 bg-white border border-fabric-200 rounded-[10px] text-[0.85rem] font-sans text-fabric-800 placeholder:text-fabric-300 transition-all focus:outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(61,138,247,0.1)]"
                />
              </div>

              {error && (
                <p className="font-mono text-[0.68rem] text-red">{error}</p>
              )}

              <button
                disabled={!issueType || !description.trim() || submitting}
                onClick={handleSubmit}
                className="w-full py-3 border-none rounded-[10px] font-sans text-sm font-semibold cursor-pointer transition-all bg-fabric-800 text-white hover:bg-black disabled:opacity-35 disabled:cursor-not-allowed mt-1"
              >
                {submitting ? 'Submitting...' : 'Submit report'}
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
