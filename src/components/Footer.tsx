export default function Footer() {
  return (
    <footer className="border-t border-fabric-200 py-7 px-5 md:h-14 md:py-0 md:px-10 md:flex md:items-center">
      <div className="max-w-container mx-auto flex flex-col md:flex-row gap-3 items-center md:justify-between md:w-full text-center md:text-left">
        <div className="font-mono text-xs text-fabric-400">
          &copy; 2026 Fabric Layer Technologies LTD. A{' '}
          <a href="https://motherbird.ai" className="text-fabric-500 no-underline hover:text-fabric-800">Motherbird</a> product.
        </div>
        <ul className="flex gap-5 list-none flex-wrap justify-center">
          <li><a href="https://github.com/motherbirdai/fabric" target="_blank" rel="noopener" className="font-mono text-xs text-fabric-400 no-underline hover:text-fabric-800">GitHub</a></li>
          <li><a href="https://x.com/fabriclayer" target="_blank" rel="noopener" className="font-mono text-xs text-fabric-400 no-underline hover:text-fabric-800">Twitter / X</a></li>
          <li><a href="https://fabriclayer.dev/docs" className="font-mono text-xs text-fabric-400 no-underline hover:text-fabric-800">Docs</a></li>
          <li className="w-px bg-fabric-200 self-stretch" />
          <li><a href="https://fabriclayer.dev/terms" className="font-mono text-xs text-fabric-400 no-underline hover:text-fabric-800">Terms</a></li>
          <li><a href="https://fabriclayer.dev/privacy" className="font-mono text-xs text-fabric-400 no-underline hover:text-fabric-800">Privacy</a></li>
          <li><a href="https://fabriclayer.dev/disclaimer" className="font-mono text-xs text-fabric-400 no-underline hover:text-fabric-800">Disclaimer</a></li>
        </ul>
      </div>
    </footer>
  )
}
