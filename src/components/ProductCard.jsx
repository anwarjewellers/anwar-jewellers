import { Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext.jsx';
import { discountPercent, hasDiscount, imageUrl, inr } from '../format.js';

export function ProductCard({ product }) {
  const { wishlist, toggleWishlist, addToCart } = useShop();
  const wished = wishlist.includes(product.id);
  const inStock = product.stock_quantity > 0;
  return (
    <div className="product-card h-100">
      <div className="product-media">
        <Link to={`/products/${product.slug}`}>
          <img src={imageUrl(product.thumb_key)} alt={product.name} loading="lazy" width="400" height="400" />
        </Link>
        {hasDiscount(product) && <span className="badge-off">{discountPercent(product)}% OFF</span>}
        <div className="wish-form">
          <button className={`wish-btn ${wished ? 'active' : ''}`} onClick={() => toggleWishlist(product)} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'} title="Wishlist">
            <i className={`bi ${wished ? 'bi-heart-fill' : 'bi-heart'}`} />
          </button>
        </div>
      </div>
      <div className="product-body">
        <Link to={`/products/${product.slug}`} className="product-name">{product.name}</Link>
        <div className="price-row">
          <span className="price">{inr(product.price)}</span>
          {hasDiscount(product) && <span className="mrp">MRP: {inr(product.original_price)}</span>}
        </div>
        {inStock ? (
          <>
            <div className="stock in">{product.stock_quantity <= 5 ? `Only ${product.stock_quantity} left` : 'In Stock'}</div>
            <button className="btn btn-gold w-100 btn-sm mt-auto" onClick={() => addToCart(product)}><i className="bi bi-bag-plus" /> Add to Cart</button>
          </>
        ) : (
          <>
            <div className="stock out">Out of Stock</div>
            <button className="btn btn-outline-secondary w-100 btn-sm mt-auto" disabled>Out of Stock</button>
          </>
        )}
      </div>
    </div>
  );
}

export function ProductGrid({ products }) {
  return (
    <div className="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-3">
      {products.map((p) => <div className="col" key={p.id}><ProductCard product={p} /></div>)}
    </div>
  );
}
