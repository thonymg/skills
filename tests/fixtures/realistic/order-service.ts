export class OrderService {
  private readonly buffer = new Float32Array(3)

  async fetchOrderList(userId: string): Promise<Order[]> {
    const orderList = await this.client.get(`/orders/${userId}`)
    return orderList
  }

  calculateOrderTotal(orderList: Order[]): number {
    return orderList.reduce((total, order) => total + order.price, 0)
  }
}
