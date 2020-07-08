import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found', 400);
    }
    const findProducts = await this.productsRepository.findAllById(products);

    if (findProducts.length !== products.length) {
      throw new AppError('Products not found');
    }

    const newProductsWithPriceAndStock = products.map(product => {
      return {
        product_id: product.id,
        quantity: product.quantity,
        ...findProducts.reduce(
          (acc, val) => {
            if (val.id === product.id) {
              return {
                price: val.price,
                stockQuantity: Number(val.quantity),
              };
            }
            return acc;
          },
          { price: 0, stockQuantity: 0 },
        ),
      };
    });

    const updatedQuantities: IProduct[] = [];

    const productsOrder = newProductsWithPriceAndStock.map(product => {
      if (product.quantity > product.stockQuantity) {
        throw new AppError('Quantity not available in stock');
      }

      updatedQuantities.push({
        id: product.product_id,
        quantity: product.stockQuantity - product.quantity,
      });

      return {
        product_id: product.product_id,
        quantity: product.quantity,
        price: product.price,
      };
    });

    const orders = await this.ordersRepository.create({
      customer,
      products: productsOrder,
    });

    await this.productsRepository.updateQuantity(updatedQuantities);

    return orders;
  }
}

export default CreateOrderService;
