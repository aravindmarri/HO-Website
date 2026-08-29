import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import './App.css'

// Total run time of the intro animation, in ms. Kept in sync with the
// setTimeout in <App /> that swaps the welcome screen for the page.
const WELCOME_DURATION = 8000

function MouseCursor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mousePos = useRef({ x: 0, y: 0 })
  const smoothPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let width = container.clientWidth || window.innerWidth
    let height = container.clientHeight || window.innerHeight

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      1000
    )
    camera.position.z = 100

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    // High-poly deformable sphere made of thousands of points
    const sphereGeo = new THREE.IcosahedronGeometry(8, 5)
    const sphereMat = new THREE.MeshPhongMaterial({
      color: 0xff4fd8,
      emissive: 0x7a3cff,
      emissiveIntensity: 0.4,
      wireframe: false,
      shininess: 100,
    })
    const sphere = new THREE.Mesh(sphereGeo, sphereMat)
    scene.add(sphere)

    // Store base positions for deformation
    const basePositions = Float32Array.from(
      (sphereGeo.attributes.position as THREE.BufferAttribute).array
    )
    const posAttr = sphereGeo.attributes.position as THREE.BufferAttribute


    type Spark = {
      pos: THREE.Vector3
      vel: THREE.Vector3
      life: number
      maxLife: number
      mesh: THREE.Mesh
    }
    const sparks: Spark[] = []

    const sparkGeo = new THREE.SphereGeometry(1.5, 4, 4)
    const createSpark = (x: number, y: number) => {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.5 + Math.random() * 1.5
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(Math.random() * 0.3 + 0.7, 1, 0.6),
        transparent: true,
      })
      const mesh = new THREE.Mesh(sparkGeo, mat)
      mesh.position.set(x, y, 0)
      scene.add(mesh)

      const life = 0.8 + Math.random() * 0.4
      sparks.push({
        pos: new THREE.Vector3(x, y, 0),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          0
        ),
        life,
        maxLife: life,
        mesh,
      })
    }

    let raf = 0
    let lastSparkX = 0
    let lastSparkY = 0

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX - width / 2
      mousePos.current.y = height / 2 - e.clientY

      // Create sparks along the trail
      const dx = mousePos.current.x - lastSparkX
      const dy = mousePos.current.y - lastSparkY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 4) {
        for (let i = 0; i < Math.floor(dist / 8); i++) {
          const t = i / Math.max(1, dist / 8)
          createSpark(
            lastSparkX + dx * t,
            lastSparkY + dy * t
          )
        }
        lastSparkX = mousePos.current.x
        lastSparkY = mousePos.current.y
      }
    }

    const tick = (now?: number) => {
      const time = (now || performance.now()) * 0.001

      // Smooth follow with easing
      smoothPos.current.x +=
        (mousePos.current.x - smoothPos.current.x) * 0.12
      smoothPos.current.y +=
        (mousePos.current.y - smoothPos.current.y) * 0.12

      // Deform the sphere with procedural noise
      const arr = posAttr.array as Float32Array
      for (let i = 0; i < arr.length; i += 3) {
        const x = basePositions[i]
        const y = basePositions[i + 1]
        const z = basePositions[i + 2]

        // Create multi-layer deformation using sine waves
        const len = Math.sqrt(x * x + y * y + z * z)
        const lat = Math.acos(z / len)
        const lon = Math.atan2(y, x)

        // Multiple sine waves for organic bulges
        const deform1 = Math.sin(lat * 4 + time * 2) * 0.15
        const deform2 = Math.cos(lon * 5 + time * 1.5) * 0.12
        const deform3 = Math.sin((lat + lon) * 3 + time * 3) * 0.1
        const deform4 = Math.sin(lon * 7 - time * 2.2) * 0.08

        const totalDeform = 1 + deform1 + deform2 + deform3 + deform4

        arr[i] = (x / len) * len * totalDeform
        arr[i + 1] = (y / len) * len * totalDeform
        arr[i + 2] = (z / len) * len * totalDeform
      }
      posAttr.needsUpdate = true

      // Update main cursor sphere
      sphere.position.set(smoothPos.current.x, smoothPos.current.y, 0)
      sphere.rotation.x += 0.008 + Math.sin(time * 0.5) * 0.003
      sphere.rotation.y += 0.013 + Math.cos(time * 0.7) * 0.004
      sphere.rotation.z += 0.005

      // Update sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.life -= 1 / 60
        s.pos.add(s.vel)
        s.mesh.position.copy(s.pos)

        const progress = 1 - s.life / s.maxLife
        const mat = s.mesh.material as THREE.MeshBasicMaterial
        mat.opacity = Math.sin(progress * Math.PI)
        s.mesh.scale.setScalar(1 - progress * 0.7)

        if (s.life <= 0) {
          scene.remove(s.mesh)
          const gm = s.mesh.geometry as THREE.SphereGeometry
          gm.dispose()
          const m = s.mesh.material as THREE.MeshBasicMaterial
          m.dispose()
          sparks.splice(i, 1)
        }
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    window.addEventListener('mousemove', handleMouseMove)

    const handleResize = () => {
      width = container.clientWidth || window.innerWidth
      height = container.clientHeight || window.innerHeight
      camera.left = -width / 2
      camera.right = width / 2
      camera.top = height / 2
      camera.bottom = -height / 2
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(raf)
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      sparks.forEach((s) => {
        const gm = s.mesh.geometry as THREE.SphereGeometry
        gm.dispose()
        const m = s.mesh.material as THREE.MeshBasicMaterial
        m.dispose()
      })
      sphereGeo.dispose()
      sphereMat.dispose()
      sparkGeo.dispose()
      renderer.dispose()
    }
  }, [])

  return <div ref={containerRef} className="mouse-cursor-container" />
}

function Welcome3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let width = container.clientWidth || window.innerWidth
    let height = container.clientHeight || window.innerHeight

    // Scene / camera / renderer
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
    camera.position.z = 8

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const pink = new THREE.PointLight(0xff4fd8, 1.2)
    pink.position.set(5, 5, 5)
    scene.add(pink)
    const cyan = new THREE.PointLight(0x4fd8ff, 1)
    cyan.position.set(-5, -4, 4)
    scene.add(cyan)

    // Group that holds the letters so we can scale the whole word to fit
    const group = new THREE.Group()
    scene.add(group)

    // Build one plane + canvas texture per character
    const text = 'Hi Welcome'
    const chars = text.split('')
    const letterW = 0.62
    const totalW = chars.length * letterW

    type Letter = {
      mesh: THREE.Mesh
      mat: THREE.MeshStandardMaterial
      geo: THREE.PlaneGeometry
      base: Float32Array
      homeX: number
      delay: number
      phase: number
    }

    const letters: Letter[] = chars.map((ch, i) => {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 256
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, 256, 256)
      if (ch.trim()) {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 180px "Sulphur Point", system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch, 128, 138)
      }

      const tex = new THREE.CanvasTexture(c)
      tex.anisotropy = 4

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        alphaMap: tex,
        transparent: true,
        opacity: 0,
        emissive: 0x7a3cff,
        emissiveIntensity: 0.6,
        depthWrite: false,
      })

      // Subdivided plane so the letter can flex like a sheet of rubber
      const geo = new THREE.PlaneGeometry(0.92, 0.92, 20, 20)
      const base = Float32Array.from(
        (geo.attributes.position as THREE.BufferAttribute).array
      )

      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      group.add(mesh)

      return {
        mesh,
        mat,
        geo,
        base,
        homeX: -totalW / 2 + letterW / 2 + i * letterW,
        delay: i * 220,
        phase: i * 1.7,
      }
    })

    // Push the letter's vertices around so it wobbles / stretches like rubber.
    // `amp` scales the jelly wave, `squash` is a signed stretch along Y.
    const flex = (L: Letter, time: number, amp: number, squash: number) => {
      const attr = L.geo.attributes.position as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      const b = L.base
      for (let k = 0; k < arr.length; k += 3) {
        const x = b[k]
        const y = b[k + 1]
        const wave =
          Math.sin(x * 3.1 + time * 6 + L.phase) * amp +
          Math.cos(y * 2.7 - time * 5 + L.phase) * amp
        arr[k] = x + Math.sin(y * 4 + time * 4 + L.phase) * amp * 0.4
        arr[k + 1] = y * (1 + squash) + Math.cos(x * 4 - time * 4) * amp * 0.4
        arr[k + 2] = wave
      }
      attr.needsUpdate = true
    }

    const fitWord = () => {
      const vH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
      const vW = vH * camera.aspect
      group.scale.setScalar(Math.min(1, (vW * 0.85) / totalW))
    }
    fitWord()

    // Timeline (ms)
    const REVEAL = 700
    const STAGGER = 220
    const revealEnd = (chars.length - 1) * STAGGER + REVEAL
    const ORBIT_START = revealEnd
    const ORBIT_DUR = 2800
    const ORBIT_END = ORBIT_START + ORBIT_DUR
    const DISSOLVE_DUR = 2200
    const DISSOLVE_START = ORBIT_END - 800
    const END = ORBIT_END + DISSOLVE_DUR

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    const easeInOut = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
    // Springy overshoot — the letter pings past its target then settles
    const easeOutElastic = (t: number) => {
      if (t <= 0) return 0
      if (t >= 1) return 1
      const c4 = (2 * Math.PI) / 3
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
    }

    let raf = 0
    const t0 = performance.now()

    const tick = (now: number) => {
      const t = now - t0

      const tSec = now / 1000

      letters.forEach((L, i) => {
        const { mesh, mat } = L
        const lt = t - L.delay

        if (t < ORBIT_START) {
          // Phase 1 — bounce up out of the hole, one letter at a time
          if (lt <= 0) {
            mesh.visible = false
            return
          }
          mesh.visible = true
          const p = clamp01(lt / REVEAL)
          const e = easeOut(p)
          const spring = easeOutElastic(p)
          mesh.position.x = L.homeX
          mesh.position.y =
            -1.5 + spring * 1.5 + (p >= 1 ? Math.sin(tSec * 2 + i) * 0.04 : 0)
          mesh.position.z = -2.6 + e * 2.6
          mesh.rotation.set(0, 0, 0)
          const s = 0.2 + e * 0.8
          // squash on the way out, wobble as it settles
          const squash = (1 - p) * 0.5 - Math.sin(p * Math.PI) * 0.2
          mesh.scale.set(s, s, s)
          mat.opacity = p
          flex(L, tSec, 0.05 + (1 - p) * 0.12, squash)
        } else if (t < DISSOLVE_START) {
          // Phase 2 — round and round in a circle, jiggling as it goes
          mesh.visible = true
          const p = (t - ORBIT_START) / ORBIT_DUR
          const spins = 3
          const baseAngle = (i / letters.length) * Math.PI * 2
          const angle = baseAngle + easeInOut(p) * Math.PI * 2 * spins
          const radius = 2.6
          const entry = clamp01(p / 0.15)
          const rx = Math.cos(angle) * radius
          const ry = Math.sin(angle) * radius
          mesh.position.x = L.homeX + (rx - L.homeX) * entry
          mesh.position.y = ry * entry
          mesh.position.z = Math.sin(angle * 0.5) * 0.6
          mesh.rotation.set(0, 0, angle + Math.PI / 2)
          mesh.scale.set(1, 1, 1)
          mat.opacity = 1
          mat.emissiveIntensity = 0.6
          flex(L, tSec, 0.06, Math.sin(tSec * 3 + L.phase) * 0.18)
        } else if (t < END) {
          // Phase 3 — blend from orbiting into stretch/knead/dissolve (smooth transition)
          mesh.visible = true
          const p = (t - DISSOLVE_START) / DISSOLVE_DUR
          const e = easeInOut(p)
          const pOrbit = (t - ORBIT_START) / ORBIT_DUR
          const baseAngle = (i / letters.length) * Math.PI * 2
          // Keep orbiting, but spiral inward faster as dissolve takes over
          const angle =
            baseAngle + easeInOut(pOrbit) * Math.PI * 2 * 3 + e * Math.PI * 2 * 4
          const radius = 2.6 * Math.max(1 - e * 1.2, 0.01)
          mesh.position.x = Math.cos(angle) * radius
          mesh.position.y = Math.sin(angle) * radius * (1 - e * 0.4) + e * 0.2
          mesh.position.z = Math.sin(angle * 0.5) * 0.6 * (1 - e)
          mesh.rotation.x += 0.06
          mesh.rotation.y += 0.09
          mesh.rotation.z = angle
          const s = Math.max(1 - e * 0.7, 0.001)
          // huge rubbery stretch that grows as it melts
          const pull = Math.sin(tSec * 6 + L.phase) * (0.4 + e * 1.1)
          mesh.scale.set(s * (1 - pull * 0.4), s * (1 + pull * 0.6), s)
          mat.opacity = Math.max(1 - e, 0)
          mat.emissiveIntensity = 0.6 + e * 1.4
          flex(L, tSec, 0.08 + e * 0.35, pull)
        } else {
          mesh.visible = false
        }
      })

      // Whole-word vortex during the dissolve
      if (t > DISSOLVE_START) {
        group.rotation.z = clamp01((t - DISSOLVE_START) / DISSOLVE_DUR) * 0.8
      }

      renderer.render(scene, camera)
      if (t < END + 300) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)

    const handleResize = () => {
      width = container.clientWidth || window.innerWidth
      height = container.clientHeight || window.innerHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      fitWord()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(raf)
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      letters.forEach((L) => {
        L.mesh.geometry.dispose()
        L.mat.map?.dispose()
        L.mat.dispose()
      })
      renderer.dispose()
    }
  }, [])

  return <div ref={containerRef} className="welcome-3d-container" />
}

function App() {
  const [showWelcome, setShowWelcome] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false)
    }, WELCOME_DURATION)
    return () => clearTimeout(timer)
  }, [])

  if (showWelcome) {
    return (
      <div onClick={() => setShowWelcome(false)} style={{ cursor: 'pointer' }}>
        <Welcome3D />
      </div>
    )
  }

  return (
    <>
      <MouseCursor />

      <section className="hero-section">
        <div className="hero-content">
          <h1>Harshitha Komali Olla</h1>
          <p className="subtitle">Full Stack Engineer | Cloud-Native Systems | GenAI & LLM Applications</p>
          <p className="bio">
            Building scalable microservices, cloud-native platforms, and AI-powered solutions.
            Crafting fast, reliable systems with .NET, Spring Boot, React.js, Kubernetes, Azure and AWS.
          </p>
        </div>
      </section>

      <section className="skills-section">
        <h2>Core Expertise</h2>
        <div className="skills-grid">
          <div className="skill-card">
            <h3>Backend</h3>
            <p>Java, Spring Boot 3, Spring WebFlux, C#, ASP.NET, GraphQL, gRPC, RESTful APIs, Microservices</p>
          </div>
          <div className="skill-card">
            <h3>Frontend</h3>
            <p>React.js, Angular, TypeScript, Next.js, Redux Toolkit, Tailwind CSS, SCSS</p>
          </div>
          <div className="skill-card">
            <h3>Cloud & DevOps</h3>
            <p>AWS (EKS, Lambda, RDS), Azure (AKS, Functions), Kubernetes, Docker, Helm, GitHub Actions, ArgoCD, Terraform</p>
          </div>
          <div className="skill-card">
            <h3>Data & AI</h3>
            <p>PostgreSQL, MongoDB, Apache Kafka, Spark, RAG, Vector Databases, LLM APIs, Semantic Search</p>
          </div>
          <div className="skill-card">
            <h3>Security</h3>
            <p>OAuth 2.0, JWT, Spring Security, Zero Trust, API Gateway, Data Protection</p>
          </div>
          <div className="skill-card">
            <h3>Observability</h3>
            <p>Prometheus, Grafana, OpenTelemetry, Jaeger, ELK Stack, Splunk, AppDynamics</p>
          </div>
        </div>
      </section>

    </>
  )
}

export default App
