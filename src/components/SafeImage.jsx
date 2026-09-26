import React, { useState, useEffect, memo } from 'react'
import { resolveApiUrl } from '../utils/apiConfig'

const SafeImage = memo(function SafeImage({ src, style, ...props }) {
  const [imgUrl, setImgUrl] = useState(src)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setImgUrl(src)
    setFailed(false)
  }, [src])

  const handleError = () => {
    if (imgUrl === src && typeof src === 'string' && /^https?:\/\//i.test(src)) {
      // Fall back to server-side image proxy to bypass CORS/referrer headers hotlink block
      setImgUrl(resolveApiUrl(`/.netlify/functions/image-proxy?url=${encodeURIComponent(src)}`))
    } else {
      // If proxy also fails or is not a remote URL, hide it
      setFailed(true)
    }
  }

  if (failed) return null

  return (
    <img
      src={imgUrl}
      onError={handleError}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }}
      {...props}
    />
  )
})

export default SafeImage
