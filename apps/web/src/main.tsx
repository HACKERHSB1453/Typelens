import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { DataSourceContext } from './data';
import { dataSource } from './data';
import { FiltersProvider } from './hooks/useFilters';
import './index.css';
import { initTheme } from './lib/themeStore';

initTheme(); // paints the saved theme before the first render

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DataSourceContext.Provider value={dataSource}>
      <FiltersProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FiltersProvider>
    </DataSourceContext.Provider>
  </React.StrictMode>,
);
