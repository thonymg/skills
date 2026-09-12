import { useQuery } from '@tanstack/react-query'
import { trackEvent } from './analytics'
import { fetchUser } from './user-service'

interface UserCardProps {
  userId: string
}

export function UserCard({ userId }: UserCardProps) {
  const { data: userList, isLoading } = useQuery(['user', userId], fetchUser)
  const boxWidth = 120

  const handleClick = () => {
    trackEvent('card_click')
  }

  if (isLoading) {
    return <Spinner data-testid="user-card-spinner" />
  }

  return (
    <div style={{ width: boxWidth, height: 40 }} onClick={handleClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" />
      {userList.map((item) => (
        <span key={item.id}>{item.name}</span>
      ))}
    </div>
  )
}
