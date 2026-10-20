import { Keypad } from './components/Keypad'
import './App.css'

export default function App() {
  return (
    <main className="app">
      <h1>Calculator</h1>
      <p className="subtitle">Every result is computed by the Go service.</p>
      <Keypad />
    </main>
  )
}
