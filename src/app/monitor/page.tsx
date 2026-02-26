import MonitorDashboard from './MonitorDashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fabric Monitor',
  robots: { index: false, follow: false },
}

export default function MonitorPage() {
  return <MonitorDashboard />
}
