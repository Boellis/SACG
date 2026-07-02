import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DemoPlotPage from './DemoPlotPage'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DemoPlotPage />
  </React.StrictMode>,
)
