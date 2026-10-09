import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';

// Pages are lazy-loaded so each route is an independent chunk — a broken page
// never takes down the whole app, and the initial bundle stays small.
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const Keys = lazy(() => import('./pages/Keys').then((m) => ({ default: m.Keys })));
const Ngrams = lazy(() => import('./pages/Ngrams').then((m) => ({ default: m.Ngrams })));
const Words = lazy(() => import('./pages/Words').then((m) => ({ default: m.Words })));
const Fingers = lazy(() => import('./pages/Fingers').then((m) => ({ default: m.Fingers })));
const Replay = lazy(() => import('./pages/Replay').then((m) => ({ default: m.Replay })));
const Progress = lazy(() => import('./pages/Progress').then((m) => ({ default: m.Progress })));
const Practice = lazy(() => import('./pages/Practice').then((m) => ({ default: m.Practice })));
const DataPage = lazy(() => import('./pages/DataPage').then((m) => ({ default: m.DataPage })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/keys" element={<Keys />} />
        <Route path="/ngrams" element={<Ngrams />} />
        <Route path="/words" element={<Words />} />
        <Route path="/fingers" element={<Fingers />} />
        <Route path="/replay" element={<Replay />} />
        <Route path="/replay/:id" element={<Replay />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
