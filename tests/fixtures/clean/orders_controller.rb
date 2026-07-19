class OrdersController < ApplicationController
  def index
  end

  def create_order
  end

  def active?
    false
  end

  def count_order_list(order_list)
    order_list.size
  end
end
