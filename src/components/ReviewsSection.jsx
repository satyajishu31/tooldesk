import React, { useState, useEffect, memo, useCallback, forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

/* ─────────────────────────────────────────────────── */
/*  REVIEWS DATA WITH DIVERSE CARICATURE AVATARS (6)   */
/* ─────────────────────────────────────────────────── */
export const REVIEWS = [
  {
    id: 'marcus',
    name: 'Marcus Vance',
    handle: '@marcus_builds',
    role: 'Lead Full-Stack Engineer',
    avatar: '/avatars/reviewer-marcus.jpg',
    accent: '#EF4444', // Crimson circular backdrop
    category: 'Engineering',
    rating: 5,
    date: '2 days ago',
    verified: 'Verified Developer',
    featured: 'Community Choice',
    headline: 'Zero server uploads. Replaced 5 paid developer utilities.',
    content:
      'We handle sensitive enterprise client data under strict NDAs. Having zero server uploads means I can format live JWTs, convert 100MB customer payloads, and test regex safely. The local WebAssembly speed is frankly mind-blowing.',
    tool: {
      name: 'File Converter',
      path: '/tools/fileconvert',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
    initialLikes: 184,
  },
  {
    id: 'aaliyah',
    name: 'Aaliyah Chen',
    handle: '@aaliyah_ui',
    role: 'Senior Product & UI Designer',
    avatar: '/avatars/reviewer-aaliyah.jpg',
    accent: '#06B6D4', // Cyan circular backdrop
    category: 'Design',
    rating: 5,
    date: '4 days ago',
    verified: 'Verified Designer',
    featured: null,
    headline: 'The tactile glassmorphism UI feels like native macOS software.',
    content:
      'Most multi-tool utility sites feel like spammy 2008 portals. ToolDesk is an aesthetic masterpiece — buttery 120fps animations, intuitive controls, and the WCAG color contrast checker has earned a permanent place in my daily workflow.',
    tool: {
      name: 'Color Picker & WCAG',
      path: '/tools/colorpicker',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      ),
    },
    initialLikes: 142,
  },
  {
    id: 'meiling',
    name: 'Dr. Mei-Ling Zhou',
    handle: '@meiling_sec',
    role: 'Cryptographer & Security Auditor',
    avatar: '/avatars/reviewer-meiling.jpg',
    accent: '#8B5CF6', // Purple circular backdrop
    category: 'Security',
    rating: 5,
    date: '1 week ago',
    verified: 'Security Researcher',
    featured: null,
    headline: 'Audited the client-side stack: Zero data packets leak.',
    content:
      'I inspected network traffic and memory allocations during Bcrypt generation and Password Vault encryption. Key derivation executes 100% inside the browser Web Crypto API. ToolDesk sets the gold standard for zero-trust privacy.',
    tool: {
      name: 'Bcrypt Hash & Vault',
      path: '/tools/bcrypt',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    initialLikes: 228,
  },
  {
    id: 'rohan',
    name: 'Rohan Patel',
    handle: '@rohan_cloud',
    role: 'Staff Cloud Architect & DevOps',
    avatar: '/avatars/reviewer-rohan.jpg',
    accent: '#6366F1', // Royal Indigo circular backdrop
    category: 'Engineering',
    rating: 5,
    date: '3 days ago',
    verified: 'Verified Pro',
    featured: null,
    headline: 'Merged and encrypted 80-page contracts without cloud wait.',
    content:
      'In enterprise operations, uploading confidential contracts to third-party SaaS converters is a strict compliance violation. ToolDesk’s local PDF engine splits, compresses, and encrypts documents directly in the browser with zero bytes leaving our machines.',
    tool: {
      name: 'PDF Studio & Toolkit',
      path: '/tools/pdf',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    initialLikes: 198,
  },
  {
    id: 'liam',
    name: 'Liam O’Connor',
    handle: '@liam_codes',
    role: 'Frontend Architect & OSS Creator',
    avatar: '/avatars/reviewer-liam.jpg',
    accent: '#10B981', // Emerald circular backdrop
    category: 'Engineering',
    rating: 5,
    date: '1 week ago',
    verified: 'OSS Maintainer',
    featured: null,
    headline: 'Instant startup, offline resilience, and 100% free forever.',
    content:
      'No account creation wall, no monthly credit card charges, no annoying cooldowns. Just lightning-fast utilities that work offline via service workers. It’s exactly what the modern open web was always meant to be.',
    tool: {
      name: 'System Info & Audit',
      path: '/tools/system-info',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
    initialLikes: 95,
  },
  {
    id: 'sofia',
    name: 'Sofia Rodriguez',
    handle: '@sofia_media',
    role: 'Motion & Digital Media Producer',
    avatar: '/avatars/reviewer-sofia.jpg',
    accent: '#F59E0B', // Warm Amber circular backdrop
    category: 'Media',
    rating: 5,
    date: '2 weeks ago',
    verified: 'Verified Creator',
    featured: null,
    headline: 'Extracted 4K frame sequences in seconds directly in the browser.',
    content:
      'Exporting video keyframes used to mean launching heavy desktop software or uploading huge files to cloud queues. With ToolDesk, I drag-and-drop 4K footage and pull high-res frames with custom time intervals instantly.',
    tool: {
      name: 'Video Screenshot',
      path: '/tools/video-screenshot',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      ),
    },
    initialLikes: 167,
  },
]

const CATEGORIES = [
  { id: 'All', label: 'All Reviews', count: 6 },
  { id: 'Engineering', label: 'Engineering', count: 3 },
  { id: 'Design', label: 'Design', count: 1 },
  { id: 'Security', label: 'Security', count: 1 },
  { id: 'Media', label: 'Media', count: 1 },
]

/* ─────────────────────────────────────────────────── */
/*  GOLD STAR COMPONENT                                */
/* ─────────────────────────────────────────────────── */
const GoldStars = memo(function GoldStars({ count = 5 }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5 }} aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="url(#starGradReviews)"
          stroke="#d97706"
          strokeWidth="0.8"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(245,158,11,0.30))' }}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  )
})

/* ─────────────────────────────────────────────────── */
/*  PERSISTED LIKES HELPER                             */
/* ─────────────────────────────────────────────────── */
const getSavedLikes = () => {
  try {
    const raw = localStorage.getItem('tooldesk_review_likes')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const saveLikeToStorage = (id, liked) => {
  try {
    const map = getSavedLikes()
    if (liked) map[id] = true
    else delete map[id]
    localStorage.setItem('tooldesk_review_likes', JSON.stringify(map))
  } catch {
    /* ignore storage errors */
  }
}

/* ─────────────────────────────────────────────────── */
/*  SINGLE REVIEW CARD COMPONENT (PERFORMANCE-OPTIMIZED)*/
/* ─────────────────────────────────────────────────── */
const ReviewCard = memo(forwardRef(function ReviewCard({ review, index }, ref) {
  const [hasLiked, setHasLiked] = useState(false)
  const [likes, setLikes] = useState(review.initialLikes)
  const [isHovered, setIsHovered] = useState(false)

  // Initialize persisted like state on mount
  useEffect(() => {
    const saved = getSavedLikes()
    if (saved[review.id]) {
      setHasLiked(true)
      setLikes(review.initialLikes + 1)
    }
  }, [review.id, review.initialLikes])

  const handleLike = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setHasLiked((prev) => {
      const next = !prev
      setLikes((c) => (next ? c + 1 : c - 1))
      saveLikeToStorage(review.id, next)
      return next
    })
  }, [review.id])

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.42, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="tooldesk-review-card"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRadius: 22,
        padding: 'clamp(20px, 2.6vw, 26px)',
        background: 'rgba(255, 255, 255, 0.90)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: isHovered
          ? `1px solid ${review.accent}45`
          : '1px solid rgba(255, 255, 255, 0.95)',
        boxShadow: isHovered
          ? `0 20px 42px -12px ${review.accent}24, 0 4px 16px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255, 255, 255, 1)`
          : '0 8px 24px rgba(15, 23, 42, 0.04), 0 2px 6px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        transform: isHovered ? 'translate3d(0, -6px, 0)' : 'translate3d(0, 0, 0)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease',
        boxSizing: 'border-box',
        overflow: 'hidden',
        contain: 'layout style',
      }}
    >
      {/* Decorative Quotation Watermark Mark */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 48,
          right: 18,
          fontFamily: 'Syne, sans-serif',
          fontSize: 78,
          fontWeight: 900,
          color: review.accent,
          opacity: isHovered ? 0.08 : 0.035,
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
          transition: 'opacity 0.3s ease',
        }}
      >
        “
      </span>

      {/* Top Specular Sheen Stripe */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '8%',
          right: '8%',
          height: 2,
          background: `linear-gradient(90deg, transparent, ${review.accent}88, transparent)`,
          opacity: isHovered ? 1 : 0.3,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Card Header & Content */}
      <div>
        {/* Reviewer Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* Avatar with Circular Accent & Status Indicator */}
            <div style={{ position: 'relative', flexShrink: 0, width: 52, height: 52 }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: `2px solid ${review.accent}`,
                  padding: 1.5,
                  background: '#ffffff',
                  boxShadow: `0 4px 12px ${review.accent}25`,
                  boxSizing: 'border-box',
                }}
              >
                <img
                  src={review.avatar}
                  alt={review.name}
                  width="52"
                  height="52"
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    display: 'block',
                    transform: isHovered ? 'scale(1.22)' : 'scale(1.18)',
                    transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </div>

              {/* Pulsing Verified Status Dot */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: '#22c55e',
                  border: '2px solid #ffffff',
                  boxShadow: '0 0 6px rgba(34, 197, 94, 0.6)',
                }}
                title="Verified active community member"
              />
            </div>

            {/* Name, Handle & Verified Tag */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <h3
                  style={{
                    fontFamily: 'Syne, sans-serif',
                    fontSize: 15.5,
                    fontWeight: 800,
                    color: '#0d0d1a',
                    margin: 0,
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {review.name}
                </h3>

                {/* Verified Shield Badge */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 7px',
                    borderRadius: 999,
                    fontSize: 10.5,
                    fontWeight: 700,
                    background: 'rgba(34, 197, 94, 0.08)',
                    color: '#15803d',
                    border: '1px solid rgba(34, 197, 94, 0.20)',
                    lineHeight: 1.2,
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {review.verified}
                </span>

                {/* Optional Featured Choice Ribbon */}
                {review.featured && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: `${review.accent}12`,
                      color: review.accent,
                      border: `1px solid ${review.accent}30`,
                      lineHeight: 1.2,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>{review.featured}</span>
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: '#64748b',
                  fontWeight: 500,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {review.role}
              </div>
            </div>
          </div>
        </div>

        {/* Rating Row & Timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GoldStars count={review.rating} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>5.0</span>
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{review.date}</span>
        </div>

        {/* Review Headline / Tagline */}
        <h4
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 15,
            fontWeight: 700,
            color: '#0f172a',
            lineHeight: 1.35,
            margin: '0 0 8px 0',
          }}
        >
          “{review.headline}”
        </h4>

        {/* Review Paragraph */}
        <p
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13.5,
            color: '#475569',
            lineHeight: 1.62,
            margin: '0 0 16px 0',
            fontWeight: 400,
          }}
        >
          {review.content}
        </p>
      </div>

      {/* Card Footer: Tool Used Pill & Helpful Reaction Counter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingTop: 12,
          borderTop: '1px solid rgba(0, 0, 0, 0.05)',
          marginTop: 'auto',
          flexWrap: 'wrap',
        }}
      >
        {/* Linked Tool Pill with Smooth Micro-Arrow */}
        <Link
          to={review.tool.path}
          className="tooldesk-tool-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            background: 'rgba(241, 245, 249, 0.85)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            color: '#334155',
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${review.accent}14`
            e.currentTarget.style.borderColor = `${review.accent}40`
            e.currentTarget.style.color = review.accent
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(241, 245, 249, 0.85)'
            e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)'
            e.currentTarget.style.color = '#334155'
          }}
        >
          <span style={{ fontSize: 13.5 }}>{review.tool.icon}</span>
          <span>{review.tool.name}</span>
          <span className="pill-arrow" style={{ display: 'inline-flex', alignItems: 'center', transition: 'transform 0.2s ease' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </Link>

        {/* Interactive Helpful / Heart Button */}
        <button
          onClick={handleLike}
          type="button"
          aria-label={`Mark as helpful, currently ${likes} likes`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            border: hasLiked
              ? `1px solid ${review.accent}66`
              : '1px solid rgba(0, 0, 0, 0.08)',
            background: hasLiked
              ? `${review.accent}15`
              : 'rgba(255, 255, 255, 0.9)',
            color: hasLiked ? review.accent : '#64748b',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            outline: 'none',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <motion.span
            animate={hasLiked ? { scale: [1, 1.45, 0.9, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.35 }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={hasLiked ? '#EF4444' : 'none'}
              stroke={hasLiked ? '#EF4444' : 'currentColor'}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'all 0.2s ease',
                filter: hasLiked ? 'drop-shadow(0 2px 6px rgba(239, 68, 68, 0.4))' : 'none',
              }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </motion.span>
          <span>{likes}</span>
        </button>
      </div>
    </motion.article>
  )
}))

/* ─────────────────────────────────────────────────── */
/*  MAIN REVIEWS SECTION (6-CARD SYMMETRIC GRID)       */
/* ─────────────────────────────────────────────────── */
export default function ReviewsSection() {
  const [activeCategory, setActiveCategory] = useState('All')

  const filteredReviews = activeCategory === 'All'
    ? REVIEWS
    : REVIEWS.filter((r) => r.category === activeCategory)

  return (
    <section
      id="reviews"
      className="home-section-deferred"
      style={{
        position: 'relative',
        padding: 'clamp(56px, 7vw, 92px) 0',
        background: 'linear-gradient(180deg, #f8faff 0%, #ffffff 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Global CSS for Review Cards & Responsive Breakpoints */}
      <style>{`
        .tooldesk-reviews-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px;
          box-sizing: border-box;
        }
        @media (max-width: 1040px) {
          .tooldesk-reviews-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 18px;
          }
        }
        @media (max-width: 660px) {
          .tooldesk-reviews-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .trust-divider {
            display: none !important;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .tooldesk-tool-pill:hover .pill-arrow {
            transform: translateX(4px);
          }
        }
      `}</style>

      {/* Star Gradient SVG Defs (Rendered once globally for maximum memory efficiency) */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden="true">
        <defs>
          <linearGradient id="starGradReviews" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>

      {/* Ambient Radial Mesh Highlights */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '5%',
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79, 142, 247, 0.07) 0%, transparent 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '5%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.06) 0%, transparent 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', position: 'relative', zIndex: 1 }}>
        {/* Section Header — Matching Live Stats Signature Design */}
        <div style={{ textAlign: 'center', marginBottom: 38 }}>
          {/* Top Pill Tag */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ duration: 0.4 }}
            style={{ textAlign: 'center', marginBottom: 18 }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: 'rgba(79, 142, 247, 0.07)',
                border: '1px solid rgba(79, 142, 247, 0.18)',
                padding: '5px 16px',
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#4F8EF7',
                  boxShadow: '0 0 8px #4F8EF7',
                  display: 'inline-block',
                  animation: 'sjpulse 1.6s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#4F8EF7',
                  letterSpacing: '.9px',
                  textTransform: 'uppercase',
                }}
              >
                Community Reviews
              </span>
            </span>
          </motion.div>

          {/* Headline - Clean Typography */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ duration: 0.5, delay: 0.06 }}
          >
            <h2
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 'clamp(30px, 4.8vw, 48px)',
                fontWeight: 900,
                color: '#0d0d1a',
                lineHeight: 1.1,
                letterSpacing: '-1.5px',
                margin: 0,
              }}
            >
              Loved by{' '}
              <span style={{ position: 'relative', display: 'inline-block' }}>
                <span
                  style={{
                    background: 'linear-gradient(125deg, #7c3aed, #4F8EF7, #06b6d4)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Builders
                </span>
              </span>{' '}
              & Creators Worldwide
            </h2>
            <p
              style={{
                fontSize: 15,
                color: '#64748b',
                marginTop: 14,
                fontWeight: 400,
                letterSpacing: '.1px',
                maxWidth: 560,
                margin: '14px auto 0',
                lineHeight: 1.6,
              }}
            >
              Real stories from developers, designers, and creators who rely on ToolDesk every day.
            </p>
          </motion.div>

          {/* Social Proof Trust Bar with Overlapping Reviewer Avatars */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ delay: 0.16, duration: 0.4 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 'clamp(10px, 2.2vw, 20px)',
              margin: '22px auto 0',
              padding: '8px 20px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(16px) saturate(180%)',
              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.95)',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)',
            }}
          >
            {/* Overlapping Avatars Facepile */}
            <div style={{ display: 'flex', alignItems: 'center' }} aria-hidden="true">
              {[
                '/avatars/reviewer-marcus.jpg',
                '/avatars/reviewer-aaliyah.jpg',
                '/avatars/reviewer-meiling.jpg',
                '/avatars/reviewer-rohan.jpg',
                '/avatars/reviewer-liam.jpg',
              ].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="Reviewer"
                  width="26"
                  height="26"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    border: '2px solid #ffffff',
                    marginLeft: i === 0 ? 0 : -8,
                    objectFit: 'cover',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                    display: 'block',
                  }}
                />
              ))}
            </div>

            {/* Rating Stars & Score */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 15.5, fontWeight: 800, color: '#0f172a' }}>
                4.99
              </span>
              <GoldStars count={5} />
            </div>

            <div className="trust-divider" style={{ width: 1, height: 14, background: 'rgba(0, 0, 0, 0.12)' }} />

            <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
              Based on <span style={{ color: '#2563EB', fontWeight: 700 }}>1,850+</span> community reviews
            </div>

            <div className="trust-divider" style={{ width: 1, height: 14, background: 'rgba(0, 0, 0, 0.12)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#16a34a', fontWeight: 700 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>100% Client-Side Privacy</span>
            </div>
          </motion.div>
        </div>

        {/* Segmented Filter Pills Container */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 30,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'rgba(0, 0, 0, 0.04)',
              padding: 4,
              borderRadius: 999,
              border: '1px solid rgba(0, 0, 0, 0.06)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    position: 'relative',
                    padding: '7px 16px',
                    borderRadius: 999,
                    border: 'none',
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#0d0d1a' : '#64748b',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  <span>{cat.label}</span>
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      opacity: isActive ? 1 : 0.65,
                      background: isActive ? 'rgba(79, 142, 247, 0.12)' : 'rgba(0, 0, 0, 0.05)',
                      color: isActive ? '#2563EB' : '#64748b',
                      padding: '1px 6px',
                      borderRadius: 999,
                    }}
                  >
                    {cat.count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Responsive, Symmetric Reviews Grid (3x2 Desktop, 2x3 Tablet, 1x6 Mobile) */}
        <motion.div layout className="tooldesk-reviews-grid">
          <AnimatePresence mode="popLayout">
            {filteredReviews.map((rev, idx) => (
              <ReviewCard key={rev.id} review={rev} index={idx} />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}
