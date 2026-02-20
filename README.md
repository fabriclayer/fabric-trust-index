# Fabric Trust Index

The public-facing Trust Index for [Fabric](https://fabriclayer.dev) — discover and verify trust scores for AI services, models, and MCP tools.

**Live at:** `trust.fabriclayer.ai`

## Stack

- **Next.js 15** — App Router, TypeScript
- **Tailwind CSS 3** — Utility-first styling
- **Vercel** — Deployment

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout + metadata
│   ├── page.tsx            # Directory page (/)
│   ├── globals.css         # Tailwind + custom styles
│   └── [slug]/
│       ├── page.tsx        # Product detail (SSG)
│       └── ProductPageClient.tsx
├── components/
│   ├── Nav.tsx             # Sticky nav with mobile menu
│   ├── Footer.tsx          # Site footer
│   ├── RatingBoxes.tsx     # Fabric-branded score boxes
│   ├── ScoreStatus.tsx     # Trusted/Caution/Blocked badge
│   ├── CategoryTag.tsx     # Color-coded category pills
│   ├── ServiceCard.tsx     # Grid card component
│   ├── SearchToolbar.tsx   # Search + filters + sort
│   ├── DisclaimerModal.tsx # Legal disclaimer modal
│   └── FabricLogo.tsx      # SVG logo component
├── data/
│   └── services.ts         # Mock service data (60+ services)
└── lib/
    └── utils.ts            # Score computation, constants
```

## Deployment

Push to GitHub and connect to Vercel. Set the custom domain to `trust.fabriclayer.ai`.

## License

MIT — Fabric Layer Technologies LTD.
