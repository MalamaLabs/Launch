'use client'

import dynamic from 'next/dynamic'

const GenesisMint = dynamic(() => import('./GenesisMint'), { ssr: false })

export default GenesisMint
