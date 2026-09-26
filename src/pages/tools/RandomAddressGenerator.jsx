import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ToolShell, { ToolCard } from '../../components/ToolShell'
import { useCopy } from '../../hooks'
import { TOOLS } from '../../constants'
import { D, FLAGS } from './generatorData.js'
import { saveFileWithFallback } from '../../utils/fileSaver'

const tool = TOOLS.find(t => t.id === 'randaddress')

/* ─── Helpers ─── */
const escapeCSV = (str) => {
  const s = String(str || '')
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s
  return `"${safe.replace(/"/g, '""')}"`
}
const ri  = (arr) => arr[Math.floor(Math.random() * arr.length)]
const r   = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const COUNTRIES = Object.keys(D)

const CARD_COLORS = [
  ['#4F8EF7','rgba(79,142,247,.1)'],
  ['#9C6FDE','rgba(156,111,222,.1)'],
  ['#F06292','rgba(240,98,146,.1)'],
  ['#22c55e','rgba(34,197,94,.1)'],
  ['#FF9800','rgba(255,152,0,.1)'],
  ['#26C6DA','rgba(38,198,218,.1)'],
  ['#FF5722','rgba(255,87,34,.1)'],
  ['#607D8B','rgba(96,125,139,.1)'],
]

/* ─── Geodemographic & Test-Fixture Dossier Engine ─── */
const REGION_HEURISTICS = {
  US: {
    region: 'North America (US-Domestic)',
    climate: 'Temperate to Continental (Köppen Cfa/Dfa)',
    tempRange: 'Summer 28°C–34°C · Winter -2°C–8°C',
    archStyles: [
      { name: 'Mid-Century Suburban Split-Level', era: '1960s–1980s', materials: 'Timber frame, vinyl siding, asphalt shingles' },
      { name: 'Colonial Revival 2-Storey', era: '1940s–1970s', materials: 'Red brick veneer, painted wood trim, gabled roof' },
      { name: 'Modern Post-Industrial Urban Loft', era: '2000s–Present', materials: 'Exposed structural steel, polished concrete, high ceilings' },
      { name: 'Craftsman Bungalow', era: '1920s–1940s', materials: 'Overhanging eaves, tapered square columns, river stone' }
    ],
    transitModes: ['Suburban Arterial / Private Auto Priority', 'Metropolitan Bus Line (<350m)', 'Light Rail Commuter Catchment (<800m)'],
    walkScoreHeuristic: 68,
    amenityNames: ['Trader Provisions & Groceries (280m)', 'CVS Community Pharmacy (410m)', 'Heritage Oak Civic Park (520m)', 'District Elementary Public School (650m)']
  },
  UK: {
    region: 'Western Europe (British Isles)',
    climate: 'Temperate Maritime / Oceanic (Köppen Cfb)',
    tempRange: 'Summer 18°C–23°C · Winter 2°C–7°C',
    archStyles: [
      { name: 'Victorian Terraced Masonry', era: '1870s–1901', materials: 'Flemish bond red brick, slate roofing, bay sash windows' },
      { name: 'Edwardian Semi-Detached Villa', era: '1901–1918', materials: 'Red brick, decorative roughcast render, timber gables' },
      { name: 'Georgian Townhouse Infill', era: '1780s–1830s', materials: 'Bath stone ashlar, wrought-iron railings, panelled entry' },
      { name: 'Contemporary Low-Carbon Infill', era: '2015–Present', materials: 'Engineered timber, zinc cladding, triple-glazed facade' }
    ],
    transitModes: ['National Rail / TfL Catchment Zone', 'High-Frequency Urban Double-Decker Route (<150m)', 'Suburban Cycle Superhighway Link'],
    walkScoreHeuristic: 82,
    amenityNames: ['Sainsbury’s Local / Express (190m)', 'Boots High Street Pharmacy (310m)', 'Victoria Memorial Gardens (400m)', 'St. Jude’s C of E Primary (580m)']
  },
  FR: {
    region: 'Western Europe (Metropolitan France)',
    climate: 'Temperate Oceanic to Semi-Continental (Köppen Cfb)',
    tempRange: 'Summer 22°C–28°C · Winter 3°C–9°C',
    archStyles: [
      { name: 'Haussmannian Cut-Stone Block', era: '1850s–1880s', materials: 'Pierre de taille limestone, wrought iron balconies, zinc mansard roof' },
      { name: 'Provençal Bastide Stucco', era: '19th Century', materials: 'Ochre lime render, terracotta canal tiles, olive timber shutters' },
      { name: 'Modernist Residential Perimeter Block', era: '1970s–1990s', materials: 'Precast reinforced concrete, ceramic mosaic facade, thermal double glazing' },
      { name: 'Belle Époque Suburban Villa', era: '1890s–1914', materials: 'Glazed polychrome brickwork, ornamental zinc dormers' }
    ],
    transitModes: ['Metro / RER High-Capacity Transit (<300m)', 'Municipal Bus Rapid Transit Lane', 'Vélib Bike-Sharing Station (<120m)'],
    walkScoreHeuristic: 89,
    amenityNames: ['Artisan Boulangerie & Pâtisserie (95m)', 'Pharmacie de Quartier (240m)', 'Square Botanique Public Gardens (350m)', 'École Élémentaire Publique (490m)']
  },
  DE: {
    region: 'Central Europe (Federal Republic)',
    climate: 'Central European Temperate (Köppen Cfb)',
    tempRange: 'Summer 20°C–26°C · Winter -1°C–5°C',
    archStyles: [
      { name: 'Gründerzeit Altbau Residential', era: '1880s–1910s', materials: 'High-ceiling solid brick, stucco facade ornamentation, double casements' },
      { name: 'Passivhaus Standard Clinker Brick', era: '2010–Present', materials: 'Triple-insulated klinker brick, mechanical heat recovery, sedum green roof' },
      { name: 'Bauhaus-Influenced Functionalism', era: '1930s–1960s', materials: 'Reinforced concrete frame, white smooth render, horizontal band windows' },
      { name: 'Half-Timbered Fachwerk Conservation', era: 'Historic Center', materials: 'Exposed oak timber frame, wattle and daub / lime plaster' }
    ],
    transitModes: ['S-Bahn / U-Bahn Rapid Transit (<450m)', 'Electrified Low-Floor Tramway Line', 'Protected Regional Radweg (Bicycle Path)'],
    walkScoreHeuristic: 85,
    amenityNames: ['Bio-Supermarkt & Bäckerei (220m)', 'Apotheke am Ring (180m)', 'Bürgerpark & Spielplatz (360m)', 'Grundschule & Kinderhort (520m)']
  },
  JP: {
    region: 'East Asia (Mainland Archipelago)',
    climate: 'Humid Subtropical Monsoonal (Köppen Cfa)',
    tempRange: 'Summer 26°C–33°C · Winter 2°C–10°C',
    archStyles: [
      { name: 'Modern Seismic Steel-Frame Residence', era: '2010–Present', materials: 'Dampened steel frame, ceramic siding panels, fire-resistant eaves' },
      { name: 'High-Density Reinforced Manshon', era: '1990s–Present', materials: 'Seismic RC construction, exterior tile veneer, auto-lock security portal' },
      { name: 'Contemporary Machiya Adaptation', era: '2000s–Present', materials: 'Laminated timber beam, cedar lattice screens (koushi), dark slate tile' },
      { name: 'Post-War Showa Compact Detached', era: '1960s–1980s', materials: 'Wood frame, mortar finish, ceramic roof tiles' }
    ],
    transitModes: ['JR / Private High-Frequency Rail (<400m)', 'Subway Linear Induction Corridor', 'Pedestrian / Bicycle Shared Shotengai Alley'],
    walkScoreHeuristic: 94,
    amenityNames: ['7-Eleven / Konbini Station (110m)', 'Matsumoto Kiyoshi Pharmacy (260m)', 'Neighborhood Chibikko Playground (310m)', 'Municipal Ward Community Center (620m)']
  },
  IN: {
    region: 'South Asia (Indian Subcontinent)',
    climate: 'Tropical Wet & Dry / Semi-Arid (Köppen Aw/BSh)',
    tempRange: 'Summer 32°C–42°C · Winter 14°C–22°C',
    archStyles: [
      { name: 'Reinforced Concrete G+3 Apartment', era: '2000s–Present', materials: 'RCC framed structure, clay brick masonry, vitrified tile finish' },
      { name: 'Independent Contemporary Villa', era: '2010–Present', materials: 'RCC slab, textured exterior weathercoat, granite entrance steps' },
      { name: 'Colonial Bungalow Heritage Revival', era: 'Mid-20th Century', materials: 'High plinth masonry, terracotta Mangalore roof tiles, shaded verandah' },
      { name: 'Gated Township Multi-Story Tower', era: '2015–Present', materials: 'Mivan shear wall formwork, solar reflective glass balconies' }
    ],
    transitModes: ['Metro Rail Corridor (<600m)', 'City Transport Bus Stand (<200m)', 'Auto-Rickshaw Feeder Hub & Shared Transit'],
    walkScoreHeuristic: 78,
    amenityNames: ['Daily Kirana & Vegetable Bazaar (140m)', 'Apollo / MedPlus Pharmacy (230m)', 'Township Community Park & Jogging Track (380m)', 'Senior Secondary CBSE School (710m)']
  },
  CA: {
    region: 'North America (Canadian Shield / Prairie)',
    climate: 'Humid Continental / Subarctic (Köppen Dfb/Dfc)',
    tempRange: 'Summer 22°C–28°C · Winter -12°C–-2°C',
    archStyles: [
      { name: 'Cold-Climate R-2000 Timber Frame', era: '1990s–Present', materials: 'Super-insulated 2x6 framing, vinyl/engineered siding, asphalt shingles' },
      { name: 'Victorian Annex Brick Semi-Detached', era: '1890s–1910s', materials: 'Red clay brick, decorative Romanesque stone trim, steep dormers' },
      { name: 'Contemporary Point Tower Condo', era: '2010–Present', materials: 'Curtain-wall glazing, exposed concrete slabs, recessed balconies' }
    ],
    transitModes: ['TTC / SkyTrain Rapid Transit (<500m)', 'Express Municipal Bus Feeder Route', 'Winter-Maintained Multi-Use Trail'],
    walkScoreHeuristic: 74,
    amenityNames: ['Provincial Grocery & Market (320m)', 'Shoppers Drug Mart Pharmacy (290m)', 'Centennial Conservation Park (510m)', 'Collegiate District Institute (680m)']
  },
  AU: {
    region: 'Oceania (Australasia)',
    climate: 'Subtropical / Temperate Oceanic (Köppen Cfa/Cfb)',
    tempRange: 'Summer 24°C–32°C · Winter 8°C–16°C',
    archStyles: [
      { name: 'Federation Weatherboard Cottage', era: '1900–1915', materials: 'Timber weatherboard, corrugated Colorbond iron roof, ornate fretwork' },
      { name: 'Modern Brick-Veneer Suburban Single', era: '1980s–Present', materials: 'Brick veneer over timber framing, concrete roof tiles, double garage' },
      { name: 'Contemporary Coastal Pavilion', era: '2010–Present', materials: 'Fibre cement cladding, spotted gum decking, louvered solar shading' }
    ],
    transitModes: ['Metropolitan Commuter Heavy Rail (<750m)', 'Express Bus Transitway Stop (<300m)', 'Suburban Active Transport Greenway'],
    walkScoreHeuristic: 71,
    amenityNames: ['Woolworths / Coles Supermarket (380m)', 'Chemist Warehouse Local (290m)', 'Community Oval & Reserve (450m)', 'State Primary Public School (720m)']
  }
}

export function getAddressDossier(addr) {
  if (!addr) return null
  const seed = `${addr.num || 101}_${addr.street || 'St'}_${addr.city || 'City'}_${addr.cc || 'US'}`
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + seed.charCodeAt(i)
    h |= 0
  }
  const pos = Math.abs(h)
  const cc = addr.cc || 'US'
  const config = REGION_HEURISTICS[cc] || {
    region: `${addr.country || 'International'} Territory`,
    climate: 'Temperate / Regional Variant (Köppen Cfa/Cfb)',
    tempRange: 'Summer 24°C–30°C · Winter 5°C–12°C',
    archStyles: [
      { name: 'Contemporary Masonry & Stucco Infill', era: '1990s–Present', materials: 'Reinforced concrete block, acrylic stucco, solar glazing' },
      { name: 'Traditional Regional Pitch-Roof Residence', era: 'Mid-20th Century', materials: 'Fired clay brick, timber truss roof, local ceramic tiles' },
      { name: 'Multi-Unit Urban Perimeter Complex', era: '2000s–Present', materials: 'Shear wall concrete, powder-coated aluminum framing' }
    ],
    transitModes: ['Municipal Transit Bus Corridor (<300m)', 'Active Pedestrian Pathway Network', 'Regional Feeder Highway Access (<1.5km)'],
    walkScoreHeuristic: 70 + (pos % 22),
    amenityNames: ['Neighborhood Provisions Market (210m)', 'Central Community Dispensary & Pharmacy (340m)', 'Public Recreational Green Plaza (460m)', 'District Comprehensive School (680m)']
  }

  const arch = config.archStyles[pos % config.archStyles.length]
  const transit = config.transitModes[(pos >> 2) % config.transitModes.length]
  const walkScore = Math.min(98, Math.max(45, (config.walkScoreHeuristic || 70) + ((pos % 11) - 5)))
  const hubCode = `${cc}-${((pos % 900) + 100)}`
  const fixtureId = `SYNTH-${cc}-${Math.abs(h).toString(36).toUpperCase().padStart(6, '0')}`

  return {
    fixtureId,
    datasetVersion: 'v2.6-synthetic',
    simulated: true,
    region: config.region,
    climateSummary: config.climate,
    temperatureRange: config.tempRange,
    architectureStyle: arch.name,
    constructionEra: arch.era,
    primaryMaterials: arch.materials,
    transitContext: transit,
    walkScoreHeuristic: walkScore,
    logisticsHub: `Dispatch Hub ${hubCode} (Standard Ground Zone)`,
    simulatedAmenities: config.amenityNames.map((name, i) => {
      const dist = 90 + ((pos + (i * 137)) % 580)
      return { id: i + 1, name: name.replace(/\(\d+m\)/, `(${dist}m)`), distance: `${dist}m` }
    })
  }
}

export function formatDossierMarkdown(addr) {
  if (!addr || !addr.dossier) return ''
  const d = addr.dossier
  return `# Test-Fixture Address Dossier
**Status:** Synthetic Heuristic (QA / Dev Mockup Only — Zero PII)
**Fixture ID:** ${d.fixtureId}

## Address Data
- **Recipient:** ${addr.name}
- **Address Line 1:** ${addr.line1}
- **Address Line 2:** ${addr.line2}
- **Country:** ${addr.country} (${addr.flag})
- **Phone (Mock):** ${addr.phone}
- **Coordinates:** ${addr.lat}, ${addr.lng}

## Geodemographic & Contextual Heuristics (Simulated)
- **Macro Region:** ${d.region}
- **Climate Classification:** ${d.climateSummary} (${d.temperatureRange})
- **Architecture Style:** ${d.architectureStyle}
- **Estimated Construction Era:** ${d.constructionEra}
- **Primary Materials:** ${d.primaryMaterials}
- **Transit & Mobility:** ${d.transitContext} (Walkability Index: ~${d.walkScoreHeuristic}/100)
- **Logistics Dispatch:** ${d.logisticsHub}

## Simulated Local Amenities (500m Radius)
${d.simulatedAmenities.map(a => `- ${a.name}`).join('\n')}

> *Disclaimer: This data is programmatically generated for automated testing, prototyping, UI mockups, and world-building. It does not correspond to real individuals or property appraisals.*
`
}

/* ─── Generate one address ─── */
function generateAddress(countryCode) {
  const cc   = countryCode === 'random' ? ri(COUNTRIES) : countryCode
  const data = D[cc]
  if (!data) return null

  const g     = ri(['male', 'female'])
  const first = ri(data[g] || data.male || ['Alex'])
  const last  = ri(data.last || ['Smith'])
  const city  = ri(data.cities || [{ n: 'City', z: '10001' }]) || { n: 'City', z: '10001' }
  const street= ri(data.streets || ['Main Street']) || 'Main Street'
  const apt   = (Math.random() > 0.45 && Array.isArray(data.apt) && data.apt.length) ? ri(data.apt) : null
  const num   = r(1, 999)
  const phone = typeof data.phone === 'function' ? data.phone() : ''
  const flag  = FLAGS[cc] || '🌍'
  const [accent, accentBg] = CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]

  const line1 = `${num} ${street}${apt ? ', ' + apt : ''}`
  const line2 = `${city.n}, ${city.z}`
  const full  = `${first} ${last}\n${line1}\n${city.n}, ${city.z}\n${data.name}`

  const addrObj = {
    id:       Date.now() + Math.random(),
    name:     `${first} ${last}`,
    first, last, g,
    line1, line2,
    city:     city.n,
    zip:      city.z,
    country:  data.name,
    cc, flag, phone, accent, accentBg, full,
    num, street, apt,
    lat:      (r(-85*100, 85*100) / 100).toFixed(4),
    lng:      (r(-180*100, 180*100) / 100).toFixed(4),
  }
  addrObj.dossier = getAddressDossier(addrObj)
  return addrObj
}

/* ─── Map pin animation ─── */
function MapPin({ accent }) {
  return (
    <div style={{ position: 'relative', width: 48, height: 58 }}>
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 36, height: 36, borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
          boxShadow: `0 4px 14px ${accent}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto',
        }}>
        <div style={{
          transform: 'rotate(45deg)',
          fontSize: 16,
        }}>📍</div>
      </motion.div>
      {/* Shadow */}
      <motion.div
        animate={{ scaleX: [1, .8, 1], opacity: [.5, .25, .5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 20, height: 4, borderRadius: '50%',
          background: `${accent}50`,
          margin: '8px auto 0',
        }}
      />
    </div>
  )
}

/* ─── Address card ─── */
function AddressCard({ addr, index }) {
  const [copiedField, setCopiedField] = useState(null)
  const [expanded,    setExpanded]    = useState(false)
  const [showDossier, setShowDossier] = useState(false)

  const copyField = (value, field) => {
    navigator.clipboard?.writeText(value).catch(() => {})
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1800)
  }

  const CopyBtn = ({ value, field }) => (
    <motion.button
      whileHover={{ scale: 1.12 }} whileTap={{ scale: .9 }}
      onClick={() => copyField(value, field)}
      style={{
        width: 28, height: 28, borderRadius: 7, border: 'none',
        background: copiedField === field ? addr.accent : `${addr.accent}14`,
        color: copiedField === field ? '#fff' : addr.accent,
        cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'all .18s', flexShrink: 0,
      }}>
      {copiedField === field ? '✓' : '⎘'}
    </motion.button>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: .3, delay: index * .05, ease: [.22,1,.36,1] }}
      layout>
      <motion.div
        whileHover={{ y: -5, boxShadow: `0 16px 40px ${addr.accent}22` }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{
          background: '#fff', borderRadius: 20, overflow: 'hidden',
          border: `1.5px solid ${addr.accent}28`,
          boxShadow: '0 3px 14px rgba(0,0,0,.06)',
        }}>

        {/* Top banner — animated map pin */}
        <div style={{
          background: `linear-gradient(135deg, ${addr.accentBg}, rgba(248,249,255,.9))`,
          padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <MapPin accent={addr.accent}/>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Recipient name */}
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 800, color: '#0d0d1a', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {addr.name}
            </div>
            {/* Address lines */}
            <div style={{ fontSize: 13, color: '#555', fontWeight: 500, marginBottom: 2, lineHeight: 1.5 }}>
              {addr.line1}
            </div>
            <div style={{ fontSize: 12.5, color: '#888', fontWeight: 400 }}>
              {addr.line2}
            </div>
            {/* Country badge */}
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: addr.accent,
                background: `${addr.accent}14`, padding: '2px 9px', borderRadius: 999,
                border: `1px solid ${addr.accent}28`,
              }}>
                {addr.flag} {addr.country}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#666',
                background: 'rgba(0,0,0,.04)', padding: '2px 7px', borderRadius: 999,
              }}>
                Fixture: {addr.dossier?.fixtureId?.slice(-6) || 'MOCK'}
              </span>
            </div>
          </div>

          {/* Copy full address */}
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: .92 }}
            onClick={() => copyField(addr.full, 'full')}
            style={{
              padding: '7px 10px', borderRadius: 9,
              border: `1.5px solid ${addr.accent}30`,
              background: copiedField === 'full' ? addr.accent : 'rgba(255,255,255,.8)',
              color: copiedField === 'full' ? '#fff' : addr.accent,
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
              fontFamily: 'DM Sans, sans-serif',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all .22s', flexShrink: 0,
              whiteSpace: 'nowrap',
            }}>
            {copiedField === 'full' ? '✓ Copied' : '📋 Copy'}
          </motion.button>
        </div>

        {/* Detail rows */}
        <div style={{ padding: '12px 18px 4px' }}>
          {[
            { label: 'Street',  value: addr.line1,  icon: '🏠', field: 'street' },
            { label: 'City',    value: addr.city,   icon: '🏙', field: 'city'   },
            { label: 'ZIP',     value: addr.zip,    icon: '📮', field: 'zip'    },
            { label: 'Phone',   value: addr.phone,  icon: '📞', field: 'phone'  },
          ].map(row => (
            <div key={row.field} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0', borderBottom: '1px solid rgba(0,0,0,.05)',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 1 }}>{row.label}</div>
                <div style={{ fontSize: 12.5, color: '#444', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</div>
              </div>
              <CopyBtn value={row.value} field={row.field}/>
            </div>
          ))}

          {/* Expanded fields */}
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                {[
                  { label: 'Country', value: addr.country,              icon: '🌍', field: 'country' },
                  { label: 'Latitude', value: addr.lat,                 icon: '🗺', field: 'lat'     },
                  { label: 'Longitude', value: addr.lng,                icon: '🗺', field: 'lng'     },
                  { label: 'Full Address', value: addr.full,            icon: '📄', field: 'fullexp' },
                ].map(row => (
                  <div key={row.field} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 1 }}>{row.label}</div>
                      <div style={{ fontSize: 12, color: '#444', fontWeight: 500, wordBreak: 'break-word', whiteSpace: row.field === 'fullexp' ? 'pre' : 'nowrap', overflow: row.field === 'fullexp' ? 'visible' : 'hidden', textOverflow: 'ellipsis' }}>{row.value}</div>
                    </div>
                    <CopyBtn value={row.value} field={row.field}/>
                  </div>
                ))}
                {/* Google Maps link & Basic JSON */}
                <div style={{ padding: '10px 0', display: 'flex', gap: 8 }}>
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(addr.line1+', '+addr.city+', '+addr.country)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, padding: '8px 0', borderRadius: 9, textAlign: 'center',
                      background: `${addr.accent}10`, color: addr.accent,
                      fontSize: 12, fontWeight: 700, textDecoration: 'none',
                      border: `1px solid ${addr.accent}25`, display: 'block' }}>
                    🗺 Open in Google Maps
                  </a>
                  <button onClick={() => copyField(JSON.stringify({name:addr.name,line1:addr.line1,city:addr.city,zip:addr.zip,country:addr.country,phone:addr.phone,lat:addr.lat,lng:addr.lng}, null, 2), 'json')}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 9,
                      background: copiedField === 'json' ? addr.accent : 'rgba(0,0,0,.04)',
                      color: copiedField === 'json' ? '#fff' : '#666',
                      fontSize: 12, fontWeight: 700, border: '1px solid rgba(0,0,0,.08)', cursor: 'pointer' }}>
                    {copiedField === 'json' ? '✓ Copied' : '{ } Copy JSON'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Expand basic details button */}
        <button onClick={() => setExpanded(e => !e)}
          style={{ width: '100%', padding: '9px', background: 'none', border: 'none', borderTop: '1px solid rgba(0,0,0,.05)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#bbb', transition: 'color .18s, background .18s' }}
          onMouseEnter={e => { e.currentTarget.style.color = addr.accent; e.currentTarget.style.background = `${addr.accent}06` }}
          onMouseLeave={e => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.background = 'none' }}>
          {expanded ? '▲ Hide details' : '▼ More details (lat, lng, full)'}
        </button>

        {/* ─── Test-Fixture Dossier Accordion Toggle ─── */}
        <motion.button
          whileHover={{ scale: 1.01 }} whileTap={{ scale: .98 }}
          onClick={() => setShowDossier(s => !s)}
          style={{
            width: '100%', padding: '10px 16px',
            background: showDossier ? `${addr.accent}12` : 'rgba(0,0,0,.02)',
            border: 'none', borderTop: '1px solid rgba(0,0,0,.06)',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700,
            color: showDossier ? addr.accent : '#555',
            fontFamily: 'DM Sans, sans-serif', transition: 'all .18s'
          }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📑</span>
            <span>Test-Fixture Dossier</span>
            <span style={{
              fontSize: 9.5, padding: '2px 7px', borderRadius: 999,
              background: `${addr.accent}20`, color: addr.accent,
              fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase'
            }}>
              QA / Dev Mock
            </span>
          </span>
          <span style={{ fontSize: 11, color: addr.accent, fontWeight: 700 }}>
            {showDossier ? '▲ Hide Dossier' : '▼ View Dossier'}
          </span>
        </motion.button>

        {/* ─── Test-Fixture Dossier Content ─── */}
        <AnimatePresence>
          {showDossier && addr.dossier && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: .25 }}
              style={{
                overflow: 'hidden',
                background: '#fafbfe',
                borderTop: `1.5px dashed ${addr.accent}35`,
                padding: '16px 18px 18px'
              }}>
              {/* Notice / Label */}
              <div style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(234, 88, 12, 0.08)',
                border: '1px solid rgba(234, 88, 12, 0.2)',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>🧪</span>
                <div style={{ fontSize: 10.5, color: '#c2410c', lineHeight: 1.4, fontWeight: 600 }}>
                  <strong>SIMULATED TEST FIXTURE (SYNTHETIC DATA):</strong> Architectural, climatic & transit attributes are generated heuristics for QA mockups and world-building. Zero real PII or census profiling.
                </div>
              </div>

              {/* Grid of dossier attributes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>
                    🏛 Architecture Style
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111', marginBottom: 2 }}>
                    {addr.dossier.architectureStyle}
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    {addr.dossier.constructionEra} · {addr.dossier.primaryMaterials}
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>
                    ⛅ Climate & Region
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111', marginBottom: 2 }}>
                    {addr.dossier.climateSummary}
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    {addr.dossier.temperatureRange} · {addr.dossier.region}
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>
                    🚆 Transport & Mobility
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111', marginBottom: 2 }}>
                    {addr.dossier.transitContext}
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    Walkability Index: ~{addr.dossier.walkScoreHeuristic}/100 (Heuristic)
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(0,0,0,.06)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>
                    📦 Dispatch & Logistics
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111', marginBottom: 2 }}>
                    {addr.dossier.logisticsHub}
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    Fixture ID: <code style={{ fontSize: 10, background: '#f1f1f5', padding: '1px 4px', borderRadius: 4 }}>{addr.dossier.fixtureId}</code>
                  </div>
                </div>
              </div>

              {/* Simulated Local Amenities (500m radius) */}
              <div style={{ background: '#fff', borderRadius: 10, padding: '11px 14px', border: '1px solid rgba(0,0,0,.06)', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#777', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🏪</span> Simulated Local Amenities (500m Test Radius)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                  {(addr.dossier?.simulatedAmenities || []).map((amenity, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#444' }}>
                      <span style={{ color: addr.accent, fontSize: 11 }}>•</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{amenity.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dossier Copy Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }}
                  onClick={() => copyField(JSON.stringify({
                    fixtureId: addr.dossier.fixtureId,
                    recipient: addr.name,
                    address: { line1: addr.line1, line2: addr.line2, city: addr.city, zip: addr.zip, country: addr.country, cc: addr.cc },
                    phone: addr.phone,
                    coordinates: { lat: addr.lat, lng: addr.lng },
                    dossier: addr.dossier,
                    metadata: { simulated: true, isPii: false, generatedAt: new Date().toISOString() }
                  }, null, 2), 'dossier-json')}
                  style={{
                    flex: 1, minWidth: 130, padding: '7px 12px', borderRadius: 8,
                    background: copiedField === 'dossier-json' ? addr.accent : `${addr.accent}12`,
                    color: copiedField === 'dossier-json' ? '#fff' : addr.accent,
                    fontSize: 11.5, fontWeight: 700, border: `1px solid ${addr.accent}25`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    fontFamily: 'DM Sans, sans-serif'
                  }}>
                  {copiedField === 'dossier-json' ? '✓ Copied Fixture JSON' : '{ } Copy QA Fixture JSON'}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }}
                  onClick={() => copyField(formatDossierMarkdown(addr), 'dossier-md')}
                  style={{
                    flex: 1, minWidth: 130, padding: '7px 12px', borderRadius: 8,
                    background: copiedField === 'dossier-md' ? '#10b981' : 'rgba(16,185,129,0.1)',
                    color: copiedField === 'dossier-md' ? '#fff' : '#059669',
                    fontSize: 11.5, fontWeight: 700, border: '1px solid rgba(16,185,129,0.25)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    fontFamily: 'DM Sans, sans-serif'
                  }}>
                  {copiedField === 'dossier-md' ? '✓ Copied Markdown' : '📄 Copy Dossier Markdown'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

/* ─── MAIN ─── */
export default function RandomAddressGenerator() {
  const [country, setCountry] = useState('random')
  const [count,   setCount]   = useState(4)
  const [addrs,   setAddrs]   = useState([])
  const [loading, setLoading] = useState(false)
  const [format,  setFormat]  = useState('cards') // cards | list
  const [copied,  copy]       = useCopy()
  const timerRef = useRef(null)

  const generate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setLoading(true)
    timerRef.current = setTimeout(() => {
      setAddrs(Array.from({ length: count }, () => generateAddress(country)).filter(Boolean))
      setLoading(false)
      timerRef.current = null
    }, 180)
  }, [country, count])

  useEffect(() => {
    generate()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copyAll = () => copy(addrs.map(a => a.full).join('\n\n---\n\n'))

  return (
    <ToolShell tool={tool}>
      <ToolCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>

          {/* Country */}
          <div>
            <div className="lbl">Country</div>
            <select className="inp sel" value={country} onChange={e => setCountry(e.target.value)}>
              <option value="random">🌍 Random Country</option>
              {COUNTRIES.map(cc => (
                <option key={cc} value={cc}>{FLAGS[cc]} {D[cc].name}</option>
              ))}
            </select>
          </div>

          {/* Count */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="lbl" style={{ margin: 0 }}>How many</div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#4F8EF7' }}>{count}</span>
            </div>
            <input type="range" min={1} max={12} value={count}
              onChange={e => setCount(+e.target.value)}
                style={{ width:'100%', marginTop: 14, background:`linear-gradient(to right,#4F8EF7 0%,#4F8EF7 ${Math.max(0,Math.min(100,((count)-(1))/((12)-(1))*100))}%,#e2e4ef ${Math.max(0,Math.min(100,((count)-(1))/((12)-(1))*100))}%,#e2e4ef 100%)`, WebkitAppearance:'none', appearance:'none', height:5, borderRadius:3, outline:'none', cursor:'pointer' }} className="rs-thumb"/>
          </div>

          {/* Format */}
          <div>
            <div className="lbl">View</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['cards', '🗃'], ['list', '📋']].map(([f, icon]) => (
                <motion.button key={f} onClick={() => setFormat(f)}
                  whileHover={{ y: -2 }} whileTap={{ scale: .94 }}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${format === f ? '#4F8EF7' : 'rgba(0,0,0,.1)'}`, background: format === f ? 'rgba(79,142,247,.09)' : '#fafafa', color: format === f ? '#4F8EF7' : '#777', fontWeight: 700, fontSize: 13, fontFamily: 'DM Sans, sans-serif', transition: 'all .18s' }}>
                  {icon}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        <motion.button onClick={generate}
          whileHover={{ scale: 1.01, y: -2 }} whileTap={{ scale: .97 }}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 16, background: 'linear-gradient(135deg, #4F8EF7, #9C6FDE)', color: '#fff', boxShadow: '0 6px 20px rgba(79,142,247,.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={loading ? { duration: .5, repeat: Infinity, ease: 'linear' } : {}}>
            {loading ? '⚙️' : '📍'}
          </motion.span>
          {loading ? 'Generating…' : `Generate ${count} Random Address${count !== 1 ? 'es' : ''}`}
        </motion.button>

        {/* Dossier info pill */}
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(79,142,247,0.06)', border: '1px solid rgba(79,142,247,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>
            <span>🧪</span>
            <span><strong>Geodemographic Dossier Included:</strong> Architectural styles, macro climate, transit mobility & mock 500m POIs for QA/dev mockups.</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#666', background: '#fff', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)' }}>
            Zero PII · Synthetic
          </span>
        </div>
      </ToolCard>

      {/* Results */}
      <AnimatePresence mode="wait">
        {addrs.length > 0 && (
          <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 14px', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                {addrs.length} address{addrs.length !== 1 ? 'es' : ''} generated
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={copyAll}
                  style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid rgba(79,142,247,.25)', background: copied ? 'rgba(34,197,94,.1)' : 'rgba(79,142,247,.07)', color: copied ? '#22c55e' : '#4F8EF7', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all .2s' }}>
                  {copied ? '✅ Copied!' : '📋 Copy all'}
                </motion.button>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={() => {
                    const header = ['Name','Street','City','ZIP','Country','Phone','Lat','Lng','Architecture_Style','Climate','Transit_Tier','Logistics_Hub'].join(',')
                    const rows = addrs.map(a => [
                      a.name, a.line1, a.city, a.zip, a.country, a.phone, a.lat, a.lng,
                      a.dossier?.architectureStyle || '',
                      a.dossier?.climateSummary || '',
                      a.dossier?.transitContext || '',
                      a.dossier?.logisticsHub || ''
                    ].map(escapeCSV).join(','))
                    const csv = [header, ...rows].join('\n')
                    saveFileWithFallback(csv, 'addresses_with_dossier.csv', 'text/csv;charset=utf-8;')
                  }}
                  style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid rgba(34,197,94,.25)', background: 'rgba(34,197,94,.07)', color: '#22c55e', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  ⬇ CSV
                </motion.button>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  onClick={() => {
                    const fixtures = addrs.map(a => ({
                      fixtureId: a.dossier?.fixtureId,
                      recipient: a.name,
                      gender: a.g,
                      streetAddress: a.line1,
                      city: a.city,
                      postalCode: a.zip,
                      country: a.country,
                      countryCode: a.cc,
                      phone: a.phone,
                      coordinates: { lat: parseFloat(a.lat), lng: parseFloat(a.lng) },
                      dossier: a.dossier,
                      metadata: {
                        datasetVersion: 'v2.6-synthetic',
                        simulated: true,
                        isPii: false,
                        generatedAt: new Date().toISOString()
                      }
                    }))
                    saveFileWithFallback(JSON.stringify(fixtures, null, 2), 'qa_address_fixtures.json', 'application/json;charset=utf-8;')
                  }}
                  style={{ padding: '6px 14px', borderRadius: 999, border: '1.5px solid rgba(156,111,222,.25)', background: 'rgba(156,111,222,.07)', color: '#9C6FDE', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  ⬇ QA JSON
                </motion.button>
              </div>
            </div>

            {format === 'cards' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 14 }}>
                <AnimatePresence>
                  {addrs.map((a, i) => <AddressCard key={a.id} addr={a} index={i}/>)}
                </AnimatePresence>
              </div>
            ) : (
              /* List view — compact */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {addrs.map((a, i) => (
                  <ListItemWithDossier key={a.id} addr={a} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ToolShell>
  )
}

/* ─── Compact List Item with Dossier Expand ─── */
function ListItemWithDossier({ addr, index }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText(addr.full).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * .05 }}
      style={{
        background: '#fff', borderRadius: 12, border: `1.5px solid ${addr.accent}22`,
        padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.04)', overflow: 'hidden'
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{addr.flag}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0d0d1a' }}>{addr.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: addr.accent, background: `${addr.accent}14`, padding: '1px 6px', borderRadius: 4 }}>
              {addr.dossier?.fixtureId?.slice(-6) || 'MOCK'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {addr.line1}, {addr.city}, {addr.zip} · {addr.country}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              padding: '5px 9px', borderRadius: 7, border: `1px solid ${addr.accent}30`,
              background: open ? `${addr.accent}18` : 'transparent',
              color: addr.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif'
            }}>
            {open ? '▲ Dossier' : '📑 Dossier'}
          </button>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: .9 }}
            onClick={handleCopy}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: copied ? '#22c55e' : `${addr.accent}14`, color: copied ? '#fff' : addr.accent, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {copied ? '✓' : '⎘'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {open && addr.dossier && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(0,0,0,.08)', fontSize: 11.5, color: '#555' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 8 }}>
              <div><strong>🏛 Arch:</strong> {addr.dossier.architectureStyle} ({addr.dossier.constructionEra})</div>
              <div><strong>⛅ Climate:</strong> {addr.dossier.climateSummary}</div>
              <div><strong>🚆 Transit:</strong> {addr.dossier.transitContext}</div>
              <div><strong>📦 Hub:</strong> {addr.dossier.logisticsHub}</div>
            </div>
            <div style={{ fontSize: 10.5, color: '#999', fontStyle: 'italic' }}>
              🧪 Synthetic test-fixture data for QA/mockups only. Zero real PII.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
