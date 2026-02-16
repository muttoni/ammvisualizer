'use client'

export function FooterLinks() {
  return (
    <footer className="site-footer reveal delay-2">
      <a
        className="footer-link"
        href="https://x.com/devrelius"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="X profile for devrelius"
      >
        <span className="x-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img" focusable="false" className="x-logo-icon" width="12" height="12">
            <path d="M4 3h5.2l4 5.6L18 3H20l-5.7 7.2L20.6 21h-5.1l-4.4-6.2L6 21H4l6-7.7z" />
          </svg>
        </span>
        <span>by @devrelius</span>
      </a>

      <a className="footer-link footer-repo" href="https://github.com/muttoni/ammvisualizer" target="_blank" rel="noopener noreferrer">
        GitHub Repo
      </a>
    </footer>
  )
}
