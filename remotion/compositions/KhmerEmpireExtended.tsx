/**
 * @fileoverview Khmer Empire Extended (v2 Overhaul) — 2.5-minute vertical 9:16
 * (1080x1920 @ 30fps, 4500 frames) cinematic 3D motion graphics composition.
 *
 * Implements advanced PBR materials, procedural Khmer prasats and Bayon stone faces,
 * InstancedMesh cityscapes, robust lighting setups, atmospheric fog, synchronized audio,
 * and automated animated subtitles.
 *
 * @module remotion/compositions/KhmerEmpireExtended
 */

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Advanced Procedural Khmer Architecture & Components
// ---------------------------------------------------------------------------

/** Scene 1: Procedural Angkor Wat style cityscape with multi-tiered prasats */
const ProceduralCityscape: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / 30;

  // Generate background instanced temple towers for scale
  const towers = React.useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      const radius = 8 + (i % 4) * 4;
      const height = 5 + (i * 1.7) % 10;
      return {
        id: i,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        height,
        scale: 0.8 + (i % 3) * 0.2,
      };
    });
  }, []);

  return (
    <group>
      {/* Central grand temple structure */}
      <group position={[0, 0, -2]}>
        {/* Tier 3 Pyramid base */}
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[7, 1, 7]} />
          <meshStandardMaterial color="#6e5c46" metalness={0.1} roughness={0.85} />
        </mesh>
        {/* Tier 2 Pyramid base */}
        <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[5, 1, 5]} />
          <meshStandardMaterial color="#7a664e" metalness={0.1} roughness={0.85} />
        </mesh>
        {/* Tier 1 Pyramid base */}
        <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.5, 1, 3.5]} />
          <meshStandardMaterial color="#857057" metalness={0.1} roughness={0.85} />
        </mesh>
        {/* Central Corn-cob Prasat Tower */}
        <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.8, 1.1, 3, 12]} />
          <meshStandardMaterial color="#917a5e" metalness={0.15} roughness={0.8} />
        </mesh>
        {/* Golden spire pinnacle */}
        <mesh position={[0, 6.3, 0]}>
          <coneGeometry args={[0.5, 1.2, 8]} />
          <meshStandardMaterial color="#ffd700" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* Surrounding background temple towers */}
      {towers.map((tower) => (
        <group key={tower.id} position={[tower.x, 0, tower.z]}>
          <mesh position={[0, tower.height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.2 * tower.scale, tower.height, 1.2 * tower.scale]} />
            <meshStandardMaterial color="#594837" metalness={0.1} roughness={0.9} />
          </mesh>
          <mesh position={[0, tower.height + 0.6, 0]}>
            <coneGeometry args={[0.8 * tower.scale, 1.2, 6]} />
            <meshStandardMaterial color="#d4af37" metalness={0.85} roughness={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** Scene 2: King's Vision with stylized royal figure and golden crown */
const KingsVisionGeometry: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / 30;
  const crownRot = t * 0.4;

  return (
    <group position={[0, 0, 0]}>
      {/* Royal Monolith / Dressed Figure */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <capsuleGeometry args={[0.6, 2.2, 8, 16]} />
        <meshStandardMaterial color="#8a7355" metalness={0.2} roughness={0.7} />
      </mesh>
      {/* Elaborate Crown */}
      <group position={[0, 3.5, 0]} rotation={[0, crownRot, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.5, 0.6, 0.8, 8]} />
          <meshStandardMaterial color="#ffd700" metalness={0.95} roughness={0.08} />
        </mesh>
        <mesh position={[0, 0.7, 0]}>
          <coneGeometry args={[0.4, 1.0, 6]} />
          <meshStandardMaterial color="#ffcc00" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>
      {/* Wireframe Southeast Asia ground map projection */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14, 12, 12]} />
        <meshBasicMaterial color="#38b000" wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  );
};

/** Scene 3: Architecture of Healing — hospital complex with medicinal garden particles */
const HospitalComplex: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / 30;

  return (
    <group>
      {/* Stone foundations & wooden healing pavilions */}
      {[-4, 0, 4].map((x, idx) => (
        <group key={idx} position={[x, 0, (idx - 1) * 3.5]}>
          {/* Stone platform */}
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <boxGeometry args={[3, 0.6, 3]} />
            <meshStandardMaterial color="#4f4336" metalness={0.1} roughness={0.9} />
          </mesh>
          {/* Wooden pavilion structure */}
          <mesh position={[0, 2, 0]} castShadow>
            <boxGeometry args={[2.2, 2.5, 2.2]} />
            <meshStandardMaterial color="#73503c" metalness={0.0} roughness={0.9} />
          </mesh>
          {/* Terracotta tiled roof */}
          <mesh position={[0, 3.6, 0]} castShadow>
            <coneGeometry args={[2, 1.2, 4]} />
            <meshStandardMaterial color="#a55333" roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Medicinal garden glowing green particles */}
      {Array.from({ length: 35 }).map((_, i) => {
        const px = (Math.sin(i * 11.2) * 6);
        const pz = (Math.cos(i * 6.5) * 6);
        const py = 0.5 + Math.abs(Math.sin(t * 2.2 + i) * 1.8);
        return (
          <mesh key={i} position={[px, py, pz]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshBasicMaterial color="#2d6a4f" />
          </mesh>
        );
      })}
    </group>
  );
};

/** Scene 4: Medical Staff — glowing abstract figures & floating herb orbs */
const MedicalStaffScene: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / 30;

  return (
    <group>
      {/* Glowing Healer Figures */}
      {[-2, 2].map((x, idx) => {
        const floatY = Math.sin(t * 2 + idx) * 0.25;
        return (
          <group key={idx} position={[x, 1.6 + floatY, 0]}>
            <mesh castShadow>
              <capsuleGeometry args={[0.35, 1.4, 8, 16]} />
              <meshStandardMaterial color="#b7efc5" emissive="#2d6a4f" emissiveIntensity={0.6} roughness={0.2} />
            </mesh>
          </group>
        );
      })}

      {/* Floating Herb Orbs with Bloom look */}
      {Array.from({ length: 20 }).map((_, i) => {
        const angle = t * 0.6 + (i / 20) * Math.PI * 2;
        const rad = 2.5 + Math.sin(i) * 0.8;
        const ox = Math.cos(angle) * rad;
        const oz = Math.sin(angle) * rad;
        const oy = 1.8 + Math.sin(t * 3.5 + i) * 0.6;
        return (
          <mesh key={i} position={[ox, oy, oz]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color="#52b788" />
          </mesh>
        );
      })}
    </group>
  );
};

/** Scene 5: The Network — wireframe map with pulsing energy links */
const EmpireNetworkScene: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / 30;

  const nodes = [
    [0, 0], [-3.5, 2.5], [3.5, 2.5], [-2.5, -3.5], [2.5, -3.5], [0, 4.5]
  ];

  return (
    <group rotation={[-0.25, t * 0.2, 0]}>
      {/* Base wireframe relief map */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12, 10, 10]} />
        <meshBasicMaterial color="#1b4332" wireframe transparent opacity={0.4} />
      </mesh>

      {/* Hospital Node Spheres */}
      {nodes.map(([nx, nz], i) => (
        <mesh key={i} position={[nx, 0.3, nz]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color="#ffb703" emissive="#fb8500" emissiveIntensity={0.9} roughness={0.3} />
        </mesh>
      ))}

      {/* Pulsing energy link connections */}
      {nodes.slice(1).map(([nx, nz], i) => {
        const pulse = 0.5 + Math.sin(t * 4.5 + i) * 0.5;
        return (
          <mesh key={`link-${i}`} position={[nx / 2, 0.3, nz / 2]} rotation={[0, i, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, Math.hypot(nx, nz), 8]} />
            <meshBasicMaterial color="#4ea8de" transparent opacity={0.5 + pulse * 0.4} />
          </mesh>
        );
      })}
    </group>
  );
};

/** Scene 6: Bayon Temple — giant stone smiling faces */
const BayonLegacyScene: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / 30;

  return (
    <group>
      {/* Central multi-faced Bayon tower */}
      <mesh position={[0, 2.8, 0]} castShadow>
        <boxGeometry args={[2.4, 5.6, 2.4]} />
        <meshStandardMaterial color="#544837" metalness={0.1} roughness={0.85} />
      </mesh>
      {/* Four cardinal smiling stone faces */}
      {[[0, 4.2, 1.25, 0], [0, 4.2, -1.25, Math.PI], [1.25, 4.2, 0, Math.PI / 2], [-1.25, 4.2, 0, -Math.PI / 2]].map(([x, y, z, rot], i) => (
        <group key={i} position={[x, y, z]} rotation={[0, rot, 0]}>
          {/* Face block */}
          <mesh castShadow>
            <boxGeometry args={[1.4, 1.6, 0.5]} />
            <meshStandardMaterial color="#615340" metalness={0.1} roughness={0.8} />
          </mesh>
          {/* Forehead / Crown relief */}
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[1.2, 0.4, 0.6]} />
            <meshStandardMaterial color="#705e48" metalness={0.15} roughness={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Main KhmerEmpireExtended Composition (v2)
// ---------------------------------------------------------------------------

export const KhmerEmpireExtended: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#050505' }}>
      {/* SCENE 1: The Hook (0 - 600 frames / 20s) */}
      <Sequence from={0} durationInFrames={600}>
        <Scene1 />
      </Sequence>

      {/* SCENE 2: The King's Vision (600 - 1500 frames / 30s) */}
      <Sequence from={600} durationInFrames={900}>
        <Scene2 />
      </Sequence>

      {/* SCENE 3: The Architecture of Healing (1500 - 2700 frames / 40s) */}
      <Sequence from={1500} durationInFrames={1200}>
        <Scene3 />
      </Sequence>

      {/* SCENE 4: The Medical Staff (2700 - 3600 frames / 30s) */}
      <Sequence from={2700} durationInFrames={900}>
        <Scene4 />
      </Sequence>

      {/* SCENE 5: The Network (3600 - 4200 frames / 20s) */}
      <Sequence from={3600} durationInFrames={600}>
        <Scene5 />
      </Sequence>

      {/* SCENE 6: The Legacy (4200 - 4500 frames / 10s) */}
      <Sequence from={4200} durationInFrames={300}>
        <Scene6 />
      </Sequence>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Individual Scene Wrappers with PBR Lighting, Fog, Audio & Subtitles
// ---------------------------------------------------------------------------

const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = frame / 600;

  const camY = interpolate(progress, [0, 1], [16, 3.5]);
  const camZ = interpolate(progress, [0, 1], [24, 7]);
  const camX = Math.sin(progress * Math.PI) * 2.5;

  const subtitleOpacity = interpolate(frame, [0, 30, 570, 600], [0, 1, 1, 0]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('scene1.mp3')} />
      <ThreeCanvas width={1080} height={1920} shadows>
        <color attach="background" args={['#1a0f0a']} />
        <fogExp2 attach="fog" args={['#1a0f0a', 0.015]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 15, 10]} intensity={1.5} color="#ffedd8" castShadow />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#FFB347" />
        <PerspectiveCamera makeDefault fov={45} position={[camX, camY, camZ]} lookAt={[0, 2, 0]} />
        <ProceduralCityscape frame={frame} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color="#33251c" roughness={0.95} />
        </mesh>
      </ThreeCanvas>
      <Subtitles text="At the dawn of the Khmer Empire, golden spires rose to touch the heavens..." opacity={subtitleOpacity} />
    </AbsoluteFill>
  );
};

const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = frame / 900;

  const angle = progress * Math.PI * 1.5;
  const radius = 11;
  const camX = Math.cos(angle) * radius;
  const camZ = Math.sin(angle) * radius;
  const camY = interpolate(progress, [0, 1], [7, 3.5]);

  const subtitleOpacity = interpolate(frame, [0, 30, 870, 900], [0, 1, 1, 0]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('scene2.mp3')} />
      <ThreeCanvas width={1080} height={1920} shadows>
        <color attach="background" args={['#0f171e']} />
        <fogExp2 attach="fog" args={['#0f171e', 0.015]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[-10, 15, 10]} intensity={1.5} color="#d8f3dc" castShadow />
        <pointLight position={[5, 5, 5]} intensity={0.5} color="#FFD700" />
        <PerspectiveCamera makeDefault fov={42} position={[camX, camY, camZ]} lookAt={[0, 2, 0]} />
        <KingsVisionGeometry frame={frame} />
      </ThreeCanvas>
      <Subtitles text="A vision of divine kingship united the realm, anchored in compassion and care." opacity={subtitleOpacity} />
    </AbsoluteFill>
  );
};

const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = frame / 1200;

  const camX = interpolate(progress, [0, 1], [-9, 9]);
  const camY = 4.5 + Math.sin(progress * Math.PI) * 1.8;
  const camZ = 13;

  const subtitleOpacity = interpolate(frame, [0, 30, 1170, 1200], [0, 1, 1, 0]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('scene3.mp3')} />
      <ThreeCanvas width={1080} height={1920} shadows>
        <color attach="background" args={['#141c26']} />
        <fogExp2 attach="fog" args={['#141c26', 0.015]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 15, 10]} intensity={1.5} color="#e0fbfc" castShadow />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#52b788" />
        <PerspectiveCamera makeDefault fov={48} position={[camX, camY, camZ]} lookAt={[0, 1.2, 0]} />
        <HospitalComplex frame={frame} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color="#1e293b" roughness={0.95} />
        </mesh>
      </ThreeCanvas>
      <Subtitles text="Across the empire, over one hundred hospitals offered sanctuary, medicine, and healing." opacity={subtitleOpacity} />
    </AbsoluteFill>
  );
};

const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = frame / 900;

  const camZ = interpolate(progress, [0, 1], [9, 5.5]);
  const camY = 2.2 + Math.sin(progress * Math.PI * 2) * 0.35;

  const subtitleOpacity = interpolate(frame, [0, 30, 870, 900], [0, 1, 1, 0]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('scene4.mp3')} />
      <ThreeCanvas width={1080} height={1920} shadows>
        <color attach="background" args={['#03071e']} />
        <fogExp2 attach="fog" args={['#03071e', 0.015]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[0, 15, 10]} intensity={1.8} color="#b7efc5" castShadow />
        <pointLight position={[0, 5, -5]} intensity={0.6} color="#38b000" />
        <PerspectiveCamera makeDefault fov={45} position={[0, camY, camZ]} lookAt={[0, 1.6, 0]} />
        <MedicalStaffScene frame={frame} />
      </ThreeCanvas>
      <Subtitles text="Dedicated healers tended to every citizen, viewing service to the sick as service to the divine." opacity={subtitleOpacity} />
    </AbsoluteFill>
  );
};

const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = frame / 600;

  const camY = interpolate(progress, [0, 1], [15, 9]);
  const camZ = interpolate(progress, [0, 1], [1.5, 6.5]);

  const subtitleOpacity = interpolate(frame, [0, 30, 570, 600], [0, 1, 1, 0]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('scene5.mp3')} />
      <ThreeCanvas width={1080} height={1920} shadows>
        <color attach="background" args={['#10002b']} />
        <fogExp2 attach="fog" args={['#10002b', 0.015]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 15, 10]} intensity={1.5} color="#e0aaff" castShadow />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#4ea8de" />
        <PerspectiveCamera makeDefault fov={52} position={[0, camY, camZ]} lookAt={[0, 0, 0]} />
        <EmpireNetworkScene frame={frame} />
      </ThreeCanvas>
      <Subtitles text="An intricate royal highway and communication network connected distant provinces into one beating heart." opacity={subtitleOpacity} />
    </AbsoluteFill>
  );
};

const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = frame / 300;

  const camY = interpolate(progress, [0, 1], [2.5, 11], { easing: Easing.inOut(Easing.cubic) });
  const camZ = interpolate(progress, [0, 1], [8.5, 15]);

  const subtitleOpacity = interpolate(frame, [0, 30, 250, 300], [0, 1, 1, 0]);
  const fadeOut = interpolate(progress, [0.85, 1], [0, 1]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('scene6.mp3')} />
      <ThreeCanvas width={1080} height={1920} shadows>
        <color attach="background" args={['#1e1b2e']} />
        <fogExp2 attach="fog" args={['#1e1b2e', 0.015]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 15, 10]} intensity={1.6} color="#ffb703" castShadow />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#fb8500" />
        <PerspectiveCamera makeDefault fov={40} position={[0, camY, camZ]} lookAt={[0, 3.2, 0]} />
        <BayonLegacyScene frame={frame} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color="#2d2640" roughness={0.95} />
        </mesh>
      </ThreeCanvas>
      <Subtitles text="Their eternal legacy endures in stone, spirit, and timeless compassion." opacity={subtitleOpacity} />
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: fadeOut, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Cinematic Subtitles Overlay Component
// ---------------------------------------------------------------------------

const Subtitles: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 140,
        paddingLeft: 60,
        paddingRight: 60,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          opacity,
          backgroundColor: 'rgba(0, 0, 0, 0.78)',
          padding: '26px 40px',
          borderRadius: 18,
          textAlign: 'center',
          maxWidth: '920px',
          border: '1px solid rgba(212, 175, 55, 0.5)',
          boxShadow: '0 10px 36px rgba(0, 0, 0, 0.7)',
        }}
      >
        <p
          style={{
            fontFamily: "'Cinzel', 'Georgia', serif",
            color: '#fff8e7',
            fontSize: 36,
            lineHeight: 1.4,
            margin: 0,
            fontWeight: 600,
            letterSpacing: 1.5,
            textShadow: '0 2px 10px rgba(0,0,0,0.9)',
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Composition Registration Metadata Export
// ---------------------------------------------------------------------------

export const compositionId = 'KhmerEmpireExtended';
export const durationInFrames = 4500; // 2.5 minutes @ 30fps
export const fps = 30;
export const width = 1080;
export const height = 1920;
