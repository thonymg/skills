import { ref } from 'vue';

export function useCart() {
  const itemCount = ref(0);
  return { itemCount };
}
