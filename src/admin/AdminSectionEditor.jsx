import AdminCardsEditor from './AdminCardsEditor.jsx'
import AdminChecklistEditor from './AdminChecklistEditor.jsx'
import AdminNotesEditor from './AdminNotesEditor.jsx'
import AdminTransportEditor from './AdminTransportEditor.jsx'
import AdminLodgingEditor from './AdminLodgingEditor.jsx'
import AdminMapEditor from './AdminMapEditor.jsx'

export default function AdminSectionEditor({ trip, section, onUpdate, activeDisplayName, remoteId, role }) {
  const props = { trip, section, onUpdate, activeDisplayName, remoteId, role }
  if (section.type === 'checklist') return <AdminChecklistEditor {...props} />
  if (section.type === 'notes') return <AdminNotesEditor {...props} />
  if (section.type === 'transport') return <AdminTransportEditor {...props} />
  if (section.type === 'lodging') return <AdminLodgingEditor {...props} />
  if (section.type === 'map') return <AdminMapEditor {...props} />
  return <AdminCardsEditor {...props} />
}
