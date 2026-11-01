import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { DataSourceContext } from './data';
import { dataSource } from './data';
import { FiltersProvider } from './hooks/useFilters';
import './index.css';
import { initTheme } from './lib/themeStore';

initTheme(); // paints the saved theme before the first render

// The extension serves the dashboard as a file (dashboard/index.html) with no server to answer deep links, so it
// keeps the route in the hash. The desktop app and the dev server answer every path with index.html.
const Router = /-extension:$/.test(window.location.protocol) ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DataSourceContext.Provider value={dataSource}>
      <FiltersProvider>
        <Router>
          <App />
        </Router>
      </FiltersProvider>
    </DataSourceContext.Provider>
  </React.StrictMode>,
);
