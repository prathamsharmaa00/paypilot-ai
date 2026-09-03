export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  badge: string;
  description: string;
  specs: string[];
  tags: string[];
};

export const products: Product[] = [
  {
    id: "nova-x16",
    name: "Nova X16",
    brand: "Astra",
    category: "Laptop",
    price: 57990,
    originalPrice: 64990,
    rating: 4.6,
    reviews: 1284,
    badge: "Best Match",
    description:
      "Balanced performance laptop for development, AI workloads and gaming.",
    specs: [
      "Ryzen 7 7840HS",
      "16GB DDR5",
      "RTX 4050",
      "512GB NVMe SSD",
    ],
    tags: ["coding", "gaming", "ai", "performance"],
  },
  {
    id: "vertex-air",
    name: "Vertex Air 14",
    brand: "Nexa",
    category: "Laptop",
    price: 54990,
    originalPrice: 59990,
    rating: 4.5,
    reviews: 863,
    badge: "Portable",
    description:
      "Lightweight laptop built for programming, college work and long battery life.",
    specs: [
      "Intel Core Ultra 5",
      "16GB LPDDR5",
      "Intel Arc Graphics",
      "1TB SSD",
    ],
    tags: ["coding", "college", "portable", "battery"],
  },
  {
    id: "forge-g15",
    name: "Forge G15",
    brand: "Volt",
    category: "Laptop",
    price: 59990,
    originalPrice: 68990,
    rating: 4.4,
    reviews: 947,
    badge: "Gaming Pick",
    description:
      "Performance-focused machine for gaming and GPU-accelerated workloads.",
    specs: [
      "Ryzen 5 8645HS",
      "16GB DDR5",
      "RTX 4050",
      "512GB Gen4 SSD",
    ],
    tags: ["gaming", "gpu", "coding", "performance"],
  },
];

export const upsellProducts = [
  {
    id: "mouse-pro",
    name: "Pulse Pro Wireless Mouse",
    price: 1299,
    reason: "Useful for programming and gaming without significantly increasing the cart value.",
  },
  {
    id: "sleeve-16",
    name: "Shield 16 Laptop Sleeve",
    price: 899,
    reason: "Protects the laptop during college or office travel.",
  },
];
