'use client'

import { useState } from 'react'

interface DisclaimerModalProps {
  onAccept: () => void
  onDecline: () => void
}

export default function DisclaimerModal({ onAccept, onDecline }: DisclaimerModalProps) {
  const [checked, setChecked] = useState(false)

  return (
    <div className="fixed inset-0 z-[9999] bg-black/55 backdrop-blur-sm flex items-center justify-center p-5 max-[480px]:p-3 animate-[fadeIn_0.3s]">
      <div className="bg-white rounded-2xl max-w-[520px] w-full max-h-[85vh] flex flex-col shadow-2xl max-md:max-w-full max-md:rounded-xl">
        <div className="p-7 pb-0 flex items-center gap-3 max-md:p-5 max-md:pb-0">
          <div className="w-10 h-10 rounded-[10px] bg-amber-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 className="text-lg font-bold tracking-tight leading-tight">Before you use the Trust Index</h2>
        </div>

        <div className="p-5 px-7 overflow-y-auto flex-1 max-md:px-5">
          <p className="text-[13.5px] text-fabric-600 leading-relaxed mb-3">
            The Fabric Trust Index provides <strong className="text-fabric-800 font-semibold">automated, informational trust scores</strong> for AI services, models, and MCP tools. Please read and accept the following before continuing:
          </p>
          <div className="bg-fabric-50 border border-fabric-200 rounded-[10px] p-4 mt-4 max-h-[200px] overflow-y-auto modal-terms max-md:max-h-40">
            <ol className="pl-5 flex flex-col gap-2">
              <li className="text-[12.5px] text-fabric-600 leading-relaxed"><strong className="text-fabric-800">Information only, not a guarantee.</strong> Trust scores are generated from publicly available data and reflect a point-in-time automated assessment.</li>
              <li className="text-[12.5px] text-fabric-600 leading-relaxed"><strong className="text-fabric-800">No endorsement of third-party services.</strong> Listing or scoring a service does not constitute an endorsement by Fabric Layer Technologies LTD or Motherbird.</li>
              <li className="text-[12.5px] text-fabric-600 leading-relaxed"><strong className="text-fabric-800">You assume all risk.</strong> Any decision to use a service discovered through the Trust Index is made entirely at your own risk.</li>
              <li className="text-[12.5px] text-fabric-600 leading-relaxed"><strong className="text-fabric-800">Scores may be incomplete or wrong.</strong> Automated scoring has inherent limitations. Always conduct your own due diligence.</li>
              <li className="text-[12.5px] text-fabric-600 leading-relaxed"><strong className="text-fabric-800">Not professional advice.</strong> Nothing on the Trust Index constitutes a security audit, legal advice, or professional recommendation.</li>
              <li className="text-[12.5px] text-fabric-600 leading-relaxed"><strong className="text-fabric-800">Active beta.</strong> The Fabric Trust Index scoring engine is in active beta. Signals, sub-signal weights, and thresholds are being calibrated in real time as coverage expands across the index. Scores may shift between versions as new data sources come online and scoring logic is refined.</li>
            </ol>
          </div>
        </div>

        <div className="p-5 px-7 pt-5 flex flex-col gap-2.5 max-md:px-5">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 accent-blue w-5 h-5 flex-shrink-0"
            />
            <span className="text-[13px] text-fabric-600 leading-normal">
              I understand that trust scores are automated and informational only, and I accept full responsibility for my own due diligence.
            </span>
          </label>
          <button
            disabled={!checked}
            onClick={onAccept}
            className="w-full py-3 border-none rounded-[10px] font-sans text-sm font-semibold cursor-pointer transition-all bg-fabric-800 text-white hover:bg-black disabled:opacity-35 disabled:cursor-not-allowed"
          >
            Accept & Continue
          </button>
          <button
            onClick={onDecline}
            className="w-full py-3 bg-transparent border-none text-fabric-500 font-sans text-sm font-medium cursor-pointer hover:text-fabric-800"
          >
            Decline — return to Fabric
          </button>
        </div>
      </div>
    </div>
  )
}
