'use client'

import { useState, useEffect, useCallback } from 'react'

interface UseTypingPlaceholderOptions {
  phrases: string[]
  typingSpeed?: number
  deletingSpeed?: number
  pauseAfterTyping?: number
  pauseAfterDeleting?: number
}

export function useTypingPlaceholder({
  phrases,
  typingSpeed = 60,
  deletingSpeed = 35,
  pauseAfterTyping = 2000,
  pauseAfterDeleting = 500,
}: UseTypingPlaceholderOptions): string {
  const [text, setText] = useState('')
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  const currentPhrase = phrases[phraseIndex] || ''

  const tick = useCallback(() => {
    if (isDeleting) {
      setText((prev) => prev.slice(0, -1))
    } else {
      setText((prev) => currentPhrase.slice(0, prev.length + 1))
    }
  }, [isDeleting, currentPhrase])

  useEffect(() => {
    if (phrases.length === 0) return

    let delay: number

    if (!isDeleting && text === currentPhrase) {
      delay = pauseAfterTyping
      const timeout = setTimeout(() => setIsDeleting(true), delay)
      return () => clearTimeout(timeout)
    }

    if (isDeleting && text === '') {
      delay = pauseAfterDeleting
      const timeout = setTimeout(() => {
        setIsDeleting(false)
        setPhraseIndex((prev) => (prev + 1) % phrases.length)
      }, delay)
      return () => clearTimeout(timeout)
    }

    delay = isDeleting ? deletingSpeed : typingSpeed
    const timeout = setTimeout(tick, delay)
    return () => clearTimeout(timeout)
  }, [text, isDeleting, currentPhrase, phrases, typingSpeed, deletingSpeed, pauseAfterTyping, pauseAfterDeleting, tick])

  return text
}
