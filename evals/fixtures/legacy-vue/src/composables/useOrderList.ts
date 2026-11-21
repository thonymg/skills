import { ref } from 'vue';

export function useOrderList() {
  const orderList = ref([]);
  return { orderList };
}
