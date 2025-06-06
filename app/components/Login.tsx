import {
  Environment,
  Float,
  OrbitControls,
  Stars,
  Text,
  Trail,
  useGLTF,
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import React, { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useUser } from "../context/UserContext";

interface LoginProps {
  onLogin: (username: string) => void;
}

const ANIMATION_DURATION = 1600; // ms

function AzeronLogo2D({ animate }: { animate: boolean }) {
  // Use a static image for 2D overlay logo (for performance)
  return (
    <img
      src="/Azeron-icon_Blue_on_Transparent.png"
      alt="Azeron Logo"
      style={{
        width: animate ? 180 : 120,
        height: animate ? 180 : 120,
        transition: "all 1.2s cubic-bezier(0.4,0,0.2,1)",
        filter: animate
          ? "drop-shadow(0 0 60px #4ECDC4) drop-shadow(0 0 120px #4ECDC4)"
          : "none",
        transform: animate
          ? "scale(2.5) rotate(360deg)"
          : "scale(1) rotate(0deg)",
        opacity: animate ? 0 : 1,
        position: "absolute",
        left: "50%",
        top: "50%",
        zIndex: 10001,
        pointerEvents: "none",
        translate: "-50% -50%",
      }}
    />
  );
}

function ParticleBurst({ animate }: { animate: boolean }) {
  // 2D canvas particles for burst effect
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!animate) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const particles = Array.from({ length: 32 }, (_, i) => ({
      angle: (Math.PI * 2 * i) / 32,
      r: 0,
      speed: 8 + Math.random() * 8,
      alpha: 1,
    }));
    let frame = 0;
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.r += p.speed;
        p.alpha -= 0.018;
        const x = w / 2 + Math.cos(p.angle) * p.r;
        const y = h / 2 + Math.sin(p.angle) * p.r;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(78,205,196,${Math.max(0, p.alpha)})`;
        ctx.shadowColor = "#4ECDC4";
        ctx.shadowBlur = 32;
        ctx.fill();
      });
      frame++;
      if (frame < 90) requestAnimationFrame(draw);
    }
    draw();
  }, [animate]);
  return (
    <canvas
      ref={ref}
      width={typeof window !== "undefined" ? window.innerWidth : 1920}
      height={typeof window !== "undefined" ? window.innerHeight : 1080}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 10000,
        opacity: animate ? 1 : 0,
        transition: "opacity 0.5s",
      }}
    />
  );
}

const QRScanner = ({
  onLogin,
  triggerLoginAnimation,
}: {
  onLogin: (username: string) => void;
  triggerLoginAnimation: () => void;
}) => {
  const [input, setInput] = useState("103ba3d0-1385-11ef-b3d3-217968650796");
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const { setUser } = useUser();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (input.trim()) {
          try {
            const response = await fetch(
              "http://api.awms-staging.azeron.local/api/v1/login-with-qr",
              {
                headers: {
                  accept: "application/json, text/plain, */*",
                  "accept-language": "en-US,en;q=0.9",
                  "access-control-allow-origin": "*",
                  authorization: "",
                  "content-type": "application/json",
                  Referer: "http://orders.awms-staging.azeron.local/",
                  "Referrer-Policy": "strict-origin-when-cross-origin",
                },
                body: JSON.stringify({ user_guid: input.trim() }),
                method: "POST",
              }
            );

            if (!response.ok) {
              throw new Error("Login failed");
            }

            const data = await response.json();
            setUser(data);
            setInput("");
            setError("");
            triggerLoginAnimation();
            setTimeout(() => {
              onLogin(input.trim());
            }, ANIMATION_DURATION);
          } catch (err) {
            setError("Failed to login. Please try again.");
            console.error("Login error:", err);
          }
        }
        setIsScanning(false);
      } else {
        setInput((prev) => prev + e.key);
        setIsScanning(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [input, onLogin, setUser, triggerLoginAnimation]);

  return (
    <div
      style={{
        position: "absolute",
        width: "300px",
        height: "100px",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.7)",
        borderRadius: "10px",
        padding: "20px",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: "16px",
          marginBottom: "10px",
          textAlign: "center",
        }}
      >
        {isScanning ? "Scanning..." : "Scan QR Code with USB Scanner"}
      </div>
      {isScanning && (
        <div
          style={{
            color: "#4ecdc4",
            fontSize: "14px",
            textAlign: "center",
          }}
        >
          {input}
        </div>
      )}
      {error && (
        <div
          style={{
            color: "#FF6B6B",
            fontSize: "14px",
            textAlign: "center",
            marginTop: "10px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};

const ParticleField = () => {
  const particles = useRef<THREE.Points>(null);
  const particleCount = 2000;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  useEffect(() => {
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      colors[i * 3] = Math.random();
      colors[i * 3 + 1] = Math.random();
      colors[i * 3 + 2] = Math.random();
    }
  }, []);

  useFrame((state) => {
    if (particles.current) {
      particles.current.rotation.y += 0.001;
      particles.current.rotation.x += 0.0005;
    }
  });

  return (
    <points ref={particles}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={colors}
          itemSize={3}
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
};

const AzeronLogo = () => {
  const logo = useGLTF("/Azeron-icon_Blue_on_Transparent.glb");
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={group} position={[0, 0, 0]} scale={0.1}>
        <primitive object={logo.scene} />
      </group>
    </Float>
  );
};

const BouncingBall = ({
  position,
  color,
  speed = 1,
}: {
  position: [number, number, number];
  color: string;
  speed?: number;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const velocity = useRef([
    (Math.random() * 0.02 - 0.01) * speed,
    (Math.random() * 0.02 - 0.01) * speed,
    (Math.random() * 0.02 - 0.01) * speed,
  ]);
  const pos = useRef(position);
  const rotationSpeed = useRef(Math.random() * 0.02);
  const scale = useRef(1);

  useFrame(() => {
    if (meshRef.current) {
      pos.current = [
        pos.current[0] + velocity.current[0],
        pos.current[1] + velocity.current[1],
        pos.current[2] + velocity.current[2],
      ];

      if (Math.abs(pos.current[0]) > 5) {
        velocity.current[0] *= -0.95;
        pos.current[0] = Math.sign(pos.current[0]) * 5;
        scale.current = 1.2;
      }
      if (Math.abs(pos.current[1]) > 5) {
        velocity.current[1] *= -0.95;
        pos.current[1] = Math.sign(pos.current[1]) * 5;
        scale.current = 1.2;
      }
      if (Math.abs(pos.current[2]) > 5) {
        velocity.current[2] *= -0.95;
        pos.current[2] = Math.sign(pos.current[2]) * 5;
        scale.current = 1.2;
      }

      meshRef.current.position.set(...pos.current);
      meshRef.current.rotation.x += rotationSpeed.current;
      meshRef.current.rotation.y += rotationSpeed.current;

      scale.current = THREE.MathUtils.lerp(scale.current, 1, 0.1);
      meshRef.current.scale.setScalar(scale.current);
    }
  });

  return (
    <Trail
      width={1}
      color={color}
      length={8}
      decay={1}
      local={false}
      stride={0}
      interval={1}
    >
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial
          color={color}
          metalness={0.8}
          roughness={0.2}
          emissive={color}
          emissiveIntensity={0.2}
        />
      </mesh>
    </Trail>
  );
};

const FloatingText = ({
  text,
  position,
  color = "#ffffff",
  size = 0.5,
}: {
  text: string;
  position: [number, number, number];
  color?: string;
  size?: number;
}) => {
  const textRef = useRef<THREE.Group>(null);
  const time = useRef(0);

  useFrame((state) => {
    if (textRef.current) {
      time.current += 0.01;
      textRef.current.position.y = position[1] + Math.sin(time.current) * 0.1;
      textRef.current.rotation.y = Math.sin(time.current * 0.5) * 0.1;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={textRef} position={position}>
        <Text
          fontSize={size}
          color={color}
          anchorX="center"
          anchorY="middle"
          font="/fonts/Inter-Bold.woff"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {text}
        </Text>
      </group>
    </Float>
  );
};

const Scene = () => {
  return (
    <>
      <color attach="background" args={["#000000"]} />
      <fog attach="fog" args={["#000000", 5, 20]} />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      <Stars
        radius={100}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />
      <Environment preset="city" />

      <AzeronLogo />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={(Math.PI * 3) / 4}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  );
};

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [showAnimation, setShowAnimation] = useState(false);
  const [blurLogin, setBlurLogin] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const [gameOpacity, setGameOpacity] = useState(0);

  useEffect(() => {
    if (showAnimation) {
      setBlurLogin(true);
      // Fade in game after login UI is mostly gone
      setTimeout(() => {
        setShowGame(true);
        setTimeout(() => setGameOpacity(1), 100); // allow mount before fade in
      }, ANIMATION_DURATION * 0.7);
    }
  }, [showAnimation]);

  // Animation overlay
  const animationOverlay = (
    <>
      {/* Animated background sweep */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9998,
          background: showAnimation
            ? "radial-gradient(circle at 50% 50%, #4ECDC4 0%, #1a1a1a 100%)"
            : "rgba(0,0,0,0.7)",
          transition: "background 1.2s cubic-bezier(0.4,0,0.2,1)",
          opacity: showAnimation ? 1 : 0,
        }}
      />
      {/* Logo animation */}
      <AzeronLogo2D animate={showAnimation} />
      {/* Particle burst, more subtle */}
      <ParticleBurst animate={showAnimation} />
    </>
  );

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        background: "linear-gradient(to bottom, #000000, #1a1a1a)",
        overflow: "hidden",
      }}
    >
      {/* Login UI crossfade out */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: showGame ? 0 : 10,
          opacity: showAnimation ? 0 : 1,
          filter: blurLogin ? "blur(16px) brightness(0.7)" : "none",
          pointerEvents: showAnimation ? "none" : "auto",
          transition:
            "opacity 0.7s cubic-bezier(0.4,0,0.2,1), filter 0.7s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 10], fov: 50 }}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            color: "#4ECDC4",
            fontSize: "24px",
            fontWeight: "bold",
            textAlign: "center",
            textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)",
            pointerEvents: "none",
          }}
        >
          Scan QR Code to Play
        </div>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            pointerEvents: "none",
          }}
        >
          <QRScanner
            onLogin={onLogin}
            triggerLoginAnimation={() => setShowAnimation(true)}
          />
        </div>
        {showAnimation && animationOverlay}
      </div>
      {/* Game UI crossfade in */}
      {showGame && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            opacity: gameOpacity,
            transition: "opacity 1.2s cubic-bezier(0.4,0,0.2,1)",
            pointerEvents: gameOpacity === 1 ? "auto" : "none",
          }}
        >
          {/* Place your game UI here, or render children if this is a wrapper */}
          {/* Example: <Game /> or {children} */}
        </div>
      )}
    </div>
  );
};

export default Login;
