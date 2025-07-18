import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import Dashboard from './pages/Dashboard';
import Wardrobe from './pages/Wardrobe';
import { Toaster } from '@/components/ui/toaster';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wardrobe" element={<Wardrobe />} />
        </Routes>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;
