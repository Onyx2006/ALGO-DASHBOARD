/* ==========================================================================
 * RED NEURONAL ARTIFICIAL — Perceptrón multicapa (MLP) implementado a mano.
 * --------------------------------------------------------------------------
 * Arquitectura fija: 8 (entrada) -> 12 (oculta) -> 4 (salida).
 * Los pesos se representan como matrices planas (Float32Array) para
 * minimizar allocations en el hot-path del bucle de simulación.
 *
 * Forward pass:
 *   h = tanh(W1 · x + b1)      W1: [12x8], b1: [12]
 *   y = tanh(W2 · h + b2)      W2: [4x12], b2: [4]
 *   dirección = argmax(y)
 *
 * No se usa backpropagation: el entrenamiento es puramente evolutivo
 * (algoritmo genético con selección, cruzamiento y mutación sobre los
 * propios pesos), característico de la "Neuroevolución" (NEAT-like,
 * en su variante más simple de topología fija).
 * ========================================================================== */

class NeuralNetwork {
  constructor(inputSize = 8, hiddenSize = 12, outputSize = 4, weights = null) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;

    if (weights) {
      this.W1 = weights.W1.slice();
      this.b1 = weights.b1.slice();
      this.W2 = weights.W2.slice();
      this.b2 = weights.b2.slice();
    } else {
      this.W1 = NeuralNetwork.randomArray(hiddenSize * inputSize);
      this.b1 = NeuralNetwork.randomArray(hiddenSize);
      this.W2 = NeuralNetwork.randomArray(outputSize * hiddenSize);
      this.b2 = NeuralNetwork.randomArray(outputSize);
    }
    this.lastHidden = new Float32Array(hiddenSize);
    this.lastOutput = new Float32Array(outputSize);
  }

  static randomArray(n) {
    const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) arr[i] = Math.random() * 2 - 1; // U(-1, 1)
    return arr;
  }

  static tanh(x) { return Math.tanh(x); }

  // Forward pass: multiplicación matriz-vector manual (sin álgebra externa).
  forward(input) {
    const { inputSize, hiddenSize, outputSize, W1, b1, W2, b2 } = this;
    const hidden = this.lastHidden;
    for (let i = 0; i < hiddenSize; i++) {
      let sum = b1[i];
      const base = i * inputSize;
      for (let j = 0; j < inputSize; j++) sum += W1[base + j] * input[j];
      hidden[i] = NeuralNetwork.tanh(sum);
    }
    const output = this.lastOutput;
    for (let i = 0; i < outputSize; i++) {
      let sum = b2[i];
      const base = i * hiddenSize;
      for (let j = 0; j < hiddenSize; j++) sum += W2[base + j] * hidden[j];
      output[i] = NeuralNetwork.tanh(sum);
    }
    return output;
  }

  argmaxDirection() {
    let best = 0;
    for (let i = 1; i < this.lastOutput.length; i++) {
      if (this.lastOutput[i] > this.lastOutput[best]) best = i;
    }
    return best; // 0:arriba 1:abajo 2:izquierda 3:derecha
  }

  clone() {
    return new NeuralNetwork(this.inputSize, this.hiddenSize, this.outputSize, {
      W1: this.W1, b1: this.b1, W2: this.W2, b2: this.b2,
    });
  }

  // Cruzamiento uniforme: cada gen (peso) se hereda de un padre al azar.
  static crossover(parentA, parentB) {
    const child = parentA.clone();
    const mix = (childArr, arrA, arrB) => {
      for (let i = 0; i < childArr.length; i++) {
        childArr[i] = Math.random() < 0.5 ? arrA[i] : arrB[i];
      }
    };
    mix(child.W1, parentA.W1, parentB.W1);
    mix(child.b1, parentA.b1, parentB.b1);
    mix(child.W2, parentA.W2, parentB.W2);
    mix(child.b2, parentA.b2, parentB.b2);
    return child;
  }

  // Mutación gaussiana: con probabilidad `rate`, cada gen recibe ruido.
  mutate(rate = 0.08, magnitude = 0.35) {
    const mutateArr = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        if (Math.random() < rate) {
          arr[i] += (Math.random() * 2 - 1) * magnitude;
          arr[i] = Math.max(-1, Math.min(1, arr[i]));
        }
      }
    };
    mutateArr(this.W1); mutateArr(this.b1);
    mutateArr(this.W2); mutateArr(this.b2);
  }
}