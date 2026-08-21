import { useEffect } from 'react'
import Lenis from 'lenis'
import { Hero } from './components/Hero'
import { LoopScene } from './components/LoopScene'
import { Mechanism, Receipts, TryIt } from './components/Sections'
import { SiteFooter } from './components/Chrome'

export default function App() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ lerp: 0.1 })
    let id = 0
    const raf = (time: number) => {
      lenis.raf(time)
      id = requestAnimationFrame(raf)
    }
    id = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(id)
      lenis.destroy()
    }
  }, [])

  return (
    <div className="grain">
      <a className="skip" href="#loop">
        Skip to the loop
      </a>
      <Hero />
      <main id="main">
        <LoopScene />
        <Mechanism />
        <Receipts />
        <TryIt />
      </main>
      <SiteFooter />
    </div>
  )
}
