import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import '@inventory/index.css'
import './inventoryEmbed.css'
import Layout from '@inventory/components/layout/Layout'
import InventoryEmbedHeader from './InventoryEmbedHeader'
import ProtectedRoute from '@inventory/components/ProtectedRoute'
import SchoolDashboard from '@school-portal/pages/SchoolDashboard'
import { ROUTES } from '@inventory/utils/routes'
import { InventoryAuthBridge } from './InventoryAuthBridge'
import InventorySchoolPicker from './InventorySchoolPicker'

function inventoryBasename() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return `${base}/inventory`.replace(/\/{2,}/g, '/') || '/inventory'
}

export default function InventorySection() {
  const basename = inventoryBasename()

  return (
    <div className="inventory-embedded-root">
      <div className="inventory-embed-body">
      <BrowserRouter basename={basename}>
        <InventoryAuthBridge>
          <InventoryEmbedHeader />
          <Routes>
            <Route path="/select" element={<InventorySchoolPicker />} />
            <Route element={<Layout />}>
              <Route
                path="/school/*"
                element={(
                  <ProtectedRoute allowedRoles={['School']} loginPath="/select">
                    <SchoolDashboard />
                  </ProtectedRoute>
                )}
              />
            </Route>
            <Route path="/" element={<Navigate to={ROUTES.school.root} replace />} />
            <Route path="*" element={<Navigate to="/select" replace />} />
          </Routes>
        </InventoryAuthBridge>
      </BrowserRouter>
      </div>
    </div>
  )
}
