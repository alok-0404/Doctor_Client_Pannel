import { Link } from 'react-router-dom'

type LoginHomeLinkProps = {
  /** Staff flows use `/portal` (role picker); patient login uses `/`. */
  to?: string
}

export function LoginHomeLink({ to = '/portal' }: LoginHomeLinkProps) {
  return (
    <Link to={to} className="login-home-button">
      Home
    </Link>
  )
}
