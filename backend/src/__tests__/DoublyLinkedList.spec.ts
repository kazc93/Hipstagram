import { DoublyLinkedList, DLLNode } from '../data-structures/DoublyLinkedList';

describe('DoublyLinkedList', () => {
  let list: DoublyLinkedList<number>;

  beforeEach(() => {
    list = new DoublyLinkedList<number>();
  });

  describe('append', () => {
    it('debería agregar un elemento a una lista vacía', () => {
      list.append(1);
      expect(list.size).toBe(1);
      expect(list.toArray()).toEqual([1]);
    });

    it('debería agregar múltiples elementos en orden', () => {
      list.append(1);
      list.append(2);
      list.append(3);
      expect(list.size).toBe(3);
      expect(list.toArray()).toEqual([1, 2, 3]);
    });

    it('debería retornar el nodo creado', () => {
      const node = list.append(42);
      expect(node).toBeInstanceOf(DLLNode);
      expect(node.data).toBe(42);
    });
  });

  describe('prepend', () => {
    it('debería agregar un elemento al inicio', () => {
      list.append(2);
      list.prepend(1);
      expect(list.toArray()).toEqual([1, 2]);
    });

    it('debería funcionar en lista vacía', () => {
      list.prepend(10);
      expect(list.size).toBe(1);
      expect(list.toArray()).toEqual([10]);
    });
  });

  describe('remove', () => {
    it('debería eliminar un nodo intermedio', () => {
      list.append(1);
      const node = list.append(2);
      list.append(3);
      list.remove(node);
      expect(list.size).toBe(2);
      expect(list.toArray()).toEqual([1, 3]);
    });

    it('debería eliminar el primer nodo', () => {
      const head = list.append(1);
      list.append(2);
      list.remove(head);
      expect(list.toArray()).toEqual([2]);
    });

    it('debería eliminar el último nodo', () => {
      list.append(1);
      const tail = list.append(2);
      list.remove(tail);
      expect(list.toArray()).toEqual([1]);
    });
  });

  describe('toArrayReversed', () => {
    it('debería retornar los elementos en orden inverso', () => {
      list.append(1);
      list.append(2);
      list.append(3);
      expect(list.toArrayReversed()).toEqual([3, 2, 1]);
    });

    it('debería retornar array vacío cuando la lista está vacía', () => {
      expect(list.toArrayReversed()).toEqual([]);
    });
  });

  describe('paginate', () => {
    beforeEach(() => {
      for (let i = 1; i <= 10; i++) list.append(i);
    });

    it('debería retornar la primera página correctamente', () => {
      const result = list.paginate(1, 3);
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(10);
      expect(result.totalPages).toBe(4);
    });

    it('debería retornar la última página con elementos restantes', () => {
      const result = list.paginate(4, 3);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('filter', () => {
    it('debería filtrar elementos que cumplen el predicado', () => {
      list.append(1);
      list.append(2);
      list.append(3);
      list.append(4);
      const pares = list.filter((n) => n % 2 === 0);
      expect(pares).toEqual([2, 4]);
    });

    it('debería retornar array vacío si ninguno cumple el predicado', () => {
      list.append(1);
      list.append(3);
      expect(list.filter((n) => n % 2 === 0)).toEqual([]);
    });
  });

  describe('clear', () => {
    it('debería vaciar la lista', () => {
      list.append(1);
      list.append(2);
      list.clear();
      expect(list.size).toBe(0);
      expect(list.toArray()).toEqual([]);
    });
  });

  describe('getHead / getTail', () => {
    it('debería retornar null en lista vacía', () => {
      expect(list.getHead()).toBeNull();
      expect(list.getTail()).toBeNull();
    });

    it('debería retornar los nodos correctos', () => {
      list.append(1);
      list.append(2);
      expect(list.getHead()?.data).toBe(1);
      expect(list.getTail()?.data).toBe(2);
    });
  });
});
