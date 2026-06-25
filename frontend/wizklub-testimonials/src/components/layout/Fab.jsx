import { IconCamera, IconPlus } from '../icons/Icons'
import './layout.css'

export default function Fab({ icon = 'camera', onClick }) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label="Quick action">
      {icon === 'camera' ? <IconCamera /> : <IconPlus />}
    </button>
  )
}
