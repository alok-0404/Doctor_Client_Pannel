const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Resize a picked photo to fit `maxSize` px and re-encode as JPEG so uploads stay small. */
export async function compressImageFile(file: File, maxSize = 600, quality = 0.85): Promise<Blob> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please choose a JPG, PNG, or WEBP image.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read this image.'))
      img.src = objectUrl
    })

    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process this image.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process this image.'))),
        'image/jpeg',
        quality
      )
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
