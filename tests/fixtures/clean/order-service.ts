export class OrderService {
  fetchOrderList(): string[] {
    return []
  }

  getSessionDurationInSeconds(): number {
    return 0
  }
}

export function calculateOrderTotal(): number {
  return 0
}

export function countOrderList(orderList: string[]): number {
  return orderList.length
}

export const MAX_RETRY_COUNT = 3
export const timeoutInMs = 5000
