import { useContext } from 'react'
import { RefreshCw } from 'lucide-react'
import { AuthContext } from '@inventory/context/AuthContext'
import { formatSchoolDisplayName, wizklubSchoolNameToBranch } from '@inventory/utils/schoolName'
import { isEmbeddedInventory } from '@inventory/utils/embed'
import { useNavigate } from '../router'
import { IconBack } from '../components/icons/Icons'
import { assetUrl } from '../lib/assets.js'
import './inventoryEmbed.css'

export default function InventoryEmbedHeader() {
  const navigate = useNavigate()
  const { user, switchInstructorSchool } = useContext(AuthContext)

  if (!isEmbeddedInventory()) return null

  const schoolName = user?.role === 'School'
    ? formatSchoolDisplayName(wizklubSchoolNameToBranch(user.name))
    : ''
  const canSwitchSchool = user?.loginType === 'instructor'

  return (
    <header className="inventory-embed-header">
      <button
        type="button"
        className="inventory-embed-header__back"
        onClick={() => navigate('/profile')}
        aria-label="Back to Profile"
      >
        <IconBack />
      </button>

      <img
        src={assetUrl('assets/logo.png')}
        alt=""
        aria-hidden
        className="inventory-embed-header__logo"
      />

      <div className="inventory-embed-header__main min-w-0 flex-1">
        <p className="inventory-embed-header__eyebrow">Kit inventory</p>
        <p className="inventory-embed-header__school truncate" title={schoolName || 'Kit inventory'}>
          {schoolName || 'Select a school'}
        </p>
      </div>

      {canSwitchSchool && (
        <button
          type="button"
          className="inventory-embed-header__switch"
          onClick={() => switchInstructorSchool()}
          aria-label="Switch school"
        >
          <RefreshCw size={14} strokeWidth={2.5} aria-hidden />
          <span className="inventory-embed-header__switch-label">Switch</span>
        </button>
      )}
    </header>
  )
}
