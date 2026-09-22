import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { AppRoutes } from './app/AppRoutes';

function App() {
  return (
    <>
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        className="inv-toasts"
      />
      <Routes>
        <Route path="/*" element={<AppRoutes />} />
      </Routes>
    </>
  );
}

export default App;
