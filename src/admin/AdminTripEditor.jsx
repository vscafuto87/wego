export default function AdminTripEditor({ trip, onBack }) {
  return (
    <div className="p-10">
      <button onClick={onBack}>← Tutti i viaggi</button>
      <p>{trip.name}</p>
    </div>
  )
}
