export type Comparator<T> = (left: T, right: T) => -1|0|1;

export class BSTRoot<T> {
  root: BST<T> | null = null;
  comparator: Comparator<T>;

  constructor(comparator?: Comparator<T>) {
    this.comparator = comparator ?? ((left: T, right: T) => {
      if (left < right) return -1;
      if (right < left) return 1;
      return 0;
    });
  }

  remove(value: T|undefined) {
    if (value === undefined || this.root === null) {
      return false;
    }
    if (this.root.value === value) {
      if (this.root.left === null) {
        this.root = this.root.right;
      } else if (this.root.right === null) {
        this.root = this.root.left;
      } else {
        const node = this.root.right.min();
        this.root.right.remove(node.value);
        node.left = this.root.left;
        node.right = this.root.right;
        this.root = node;
        return;
      }
    } else {
      this.root.remove(value);
    }
  }

  insert(value: T) {
    if (this.root === null) {
      this.root = new BST<T>(value, this.comparator);
    } else {
      this.root.insert(value);
    }
  }

  *getValues(): IterableIterator<T> {
    if (this.root !== null) {
      yield* this.root.getValues();
    }
  }

  balance() {
    // this could be done in O(1) memory if we build from the bottom up
    const values = Array.from(this.getValues());
    this._buildTree(values, 0, values.length);
  }

  _buildTree(values: T[], start: number, end: number): BST<T>|null {
    if (start >= end) return null;
    const mid = Math.floor((end - start) / 2);
    const node = new BST<T>(values[mid], this.comparator);
    node.left = this._buildTree(values, start, mid);
    node.right = this._buildTree(values, mid+1, end);
    return node;
  }
}

class BST<T> {
  value: T;
  comparator: Comparator<T>;

  left: BST<T>|null = null;
  right: BST<T>|null = null;
  depth = 0;
  size = 0;
  
  constructor(value: T, comparator: Comparator<T>) {
    this.value = value;
    this.comparator = comparator;
  }

  insert(value: T) {
    const comp = this.comparator(value, this.value);
    if (comp === -1) {
      if (this.left === null) {
        this.left = new BST<T>(value, this.comparator);
      } else {
        this.left.insert(value);
      }
    } else if (comp === 1) {
      if (this.right === null) {
        this.right = new BST<T>(value, this.comparator);
      }
      this.right.insert(value);
    }
    this.update();
  }

  remove(value: T): BST<T>|null {
    const comp = this.comparator(value, this.value);
    if (comp === -1) {
      this.left = this.left?.remove(value) ?? null;
    }
    if (comp === 1) {
      this.right = this.right?.remove(value) ?? null;
    }
    if (comp === 0) {
      if (this.left === null) return this.right;
      if (this.right === null) return this.left;
      const node = this.right.min();
      this.right.remove(node.value);
      node.left = this.left;
      node.right = this.right;
      return node;
    }
    this.update();
    return this;
  }

  min(): BST<T> {
    return this.left?.min() ?? this;
  }
  
  max(): BST<T> {
    return this.right?.min() ?? this;
  }

  update() {
    this.depth = Math.max(this.left?.depth ?? 0, this.right?.depth ?? 0) + 1;
    this.size = (this.left?.size ?? 0) + (this.right?.depth ?? 0) + 1;
  }

  *getValues(): IterableIterator<T> {
    yield* this.left?.getValues() ?? [];
    yield this.value;
    yield* this.right?.getValues() ?? [];
  }
}
