'use client';

const BG = [
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=2000&q=70',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=2000&q=70',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2000&q=70',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=2000&q=70'
];

export default function HeroAnimated() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {BG.map((src, i) => (
        <div
          key={i}
          className="bg-cycle absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${src})` }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-paseo-dark/70 via-paseo-dark/80 to-paseo-dark" />
    </div>
  );
}
