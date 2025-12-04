# Cloud Storage Solution Research Report
## Permanent Image Hosting for FridgeMenu Application

**Research Date:** December 4, 2025
**Target Capacity:** 10GB (~5000 images)
**Use Case:** Permanent URL image hosting (replacing Aliyun Tongyi temp URLs that expire after 24 hours)

---

## Executive Summary

Based on comprehensive research of cloud storage and CDN solutions available in 2025, **Aliyun OSS with Aliyun CDN** is the recommended solution for permanent image hosting in your FridgeMenu application.

### Key Recommendation
- **Provider:** Alibaba Cloud (Aliyun)
- **Service:** Object Storage Service (OSS) + Content Delivery Network (CDN)
- **Storage Configuration:** Public-read bucket for permanent URLs
- **Expected Monthly Cost:** Approximately ¥50-80 (storage + CDN transfer)

---

## Decision

**Recommended Solution: Aliyun OSS with Built-in CDN Acceleration**

Use Aliyun OSS as the primary storage with Aliyun CDN as the distribution layer. This approach:
- Provides permanent, non-expiring URLs via public-read bucket configuration
- Leverages your existing Aliyun infrastructure (Tongyi services already in use)
- Offers 30-40% cost savings vs OSS direct access through CDN
- Includes seamless Node.js SDK integration
- Optimized for China mainland network performance

---

## Rationale

### 1. Ecosystem Integration
- **Existing Investment:** Your application already uses Aliyun Tongyi for recipe recommendations
- **Unified Management:** Single vendor platform simplifies architecture, billing, and support
- **Data Residency:** Maintains data in China region (important for ICP compliance and performance)

### 2. Cost Efficiency
- **CDN Savings:** CDN bandwidth costs only 30-40% of direct OSS egress costs
- **Storage Economics:** Aliyun OSS Standard tier is competitively priced (~¥0.0115/GB/month in China regions)
- **No Hidden Fees:** Transparent pay-as-you-go pricing model

### 3. Permanent URL Capability
- **Public-Read ACL:** Objects in public-read buckets generate permanent HTTP URLs without expiration
- **Simplicity:** No need for signed URL generation and renewal logic
- **Reliability:** URLs remain valid indefinitely as long as object exists

### 4. Performance for China Users
- **Extensive Node Network:** Aliyun CDN operates 2000+ nodes across China
- **Latency:** Typical sub-500ms delivery to mainland China users
- **Great Firewall Compliance:** No international routing issues

### 5. Developer Experience
- **Official Node.js SDK:** Well-maintained `ali-oss` package on npm
- **Excellent Documentation:** Comprehensive guides and code samples
- **Active Community:** Large Chinese developer community for troubleshooting

---

## Alternatives Considered

### Option 1: Tencent Cloud COS
**Advantages:**
- Deep WeChat ecosystem integration (if targeting WeChat Mini Programs)
- Competitive pricing (similar to Aliyun)
- Excellent CDN network in China (2500+ nodes)
- EdgeOne CDN offering with free China access

**Disadvantages:**
- Separate vendor increases operational complexity
- Less integrated with your existing Aliyun stack
- No existing relationship/discount potential
- Requires additional Node.js SDK (`cos-nodejs-sdk-v5`)

**Verdict:** Only consider if specific WeChat Mini Program requirements exist

### Option 2: AWS S3 + CloudFront
**Advantages:**
- Globally recognized infrastructure
- Mature API and SDKs
- Strong security features

**Disadvantages:**
- Much higher costs for China access
- Potential Great Firewall blocking issues
- No mainland China CDN nodes
- CloudFront doesn't optimize for China market
- Not recommended for China-focused applications

### Option 3: Qiniu Cloud (七牛云)
**Advantages:**
- Specialized for image storage and delivery
- Excellent image processing capabilities
- Good China-specific optimizations

**Disadvantages:**
- Smaller ecosystem than Aliyun/Tencent
- Less integration with other services
- Higher learning curve with proprietary APIs

### Option 4: Self-Hosted CDN Solution
**Disadvantages:**
- Massive operational overhead
- Requires maintenance and scaling
- ICP compliance complexity
- Cost prohibitive for 10GB storage
- Not recommended for startups/MVPs

---

## Key Implementation Details

### 1. Recommended Provider and Service Configuration

**Aliyun OSS:**
- **Region:** CN-Hangzhou (or CN-Beijing for northern users)
- **Storage Class:** Standard (infrequent access not recommended for image content)
- **Bucket Name:** `fridgemenu-images` or similar
- **Bucket ACL:** Public-read

**Aliyun CDN:**
- **Domain:** CNAME to your OSS bucket endpoint
- **Acceleration Type:** Image acceleration
- **HTTPS:** Enabled with free certificate
- **Cache TTL:** 30 days (for image permanence)

### 2. Storage Bucket Configuration

```
Bucket Configuration:
├── Access Control
│   ├── Bucket ACL: Public-read
│   └── Block Public Access: FALSE
├── Static Website Hosting
│   ├── Enabled: YES (optional, for web access)
│   └── Index Document: index.html
├── CORS Configuration
│   ├── Allowed Origins: ["http://localhost:*", "https://yourdomain.com"]
│   ├── Allowed Methods: ["GET", "HEAD"]
│   └── Allowed Headers: ["*"]
└── CDN Configuration
    ├── CDN Domain: images.fridgemenu.cn
    └── Cache Duration: 2592000 seconds (30 days)
```

### 3. URL Format and Permanence Guarantee

**Permanent URL Format:**
```
Public URL (via CDN):
https://images.fridgemenu.cn/[bucket-name]/[object-key]

Direct OSS URL (fallback):
https://[bucket-name].oss-cn-hangzhou.aliyuncs.com/[object-key]

Format Example:
https://images.fridgemenu.cn/fridgemenu-images/recipe_123_abc.jpg
```

**Permanence Guarantee:**
- URLs remain valid **indefinitely** as long as:
  1. Object exists in the bucket
  2. Bucket remains public-read
  3. CDN domain is active
- No expiration datetime is appended to URLs
- Perfect for database storage and sharing

### 4. CDN Setup Requirements

**Step-by-Step CDN Configuration:**

1. **Create Custom Domain in Aliyun CDN:**
   - Add domain: `images.fridgemenu.cn`
   - Set origin: `fridgemenu-images.oss-cn-hangzhou.aliyuncs.com`
   - Acceleration region: Mainland China + Hong Kong
   - Business type: Image acceleration

2. **DNS Configuration:**
   ```
   DNS Record Type: CNAME
   Host: images
   Target: fridgemenu-images.oss-cn-hangzhou.aliyuncs.com.w.cdnzz.com
   TTL: 600
   ```

3. **HTTPS/SSL Setup:**
   - Enable HTTPS: Yes
   - Certificate: Auto (Aliyun provides free certificates)
   - Redirect HTTP to HTTPS: Yes

4. **Cache Rules:**
   ```
   Default TTL: 2592000 seconds (30 days)
   Expired File Revalidation: On
   Ignore Cache-Control Headers: No
   Ignore Accept-Encoding: No
   ```

5. **Performance Monitoring:**
   - Monitor CDN bandwidth usage
   - Track hit ratio (aim for >80%)
   - Watch origin bandwidth for cost control

### 5. Cost Breakdown

**Assumption Parameters:**
- Storage: 10 GB (5000 images, avg 2MB each)
- Monthly Traffic: ~500 GB (1000 users × 10 images × 50KB avg)
- Pricing Region: Mainland China

**Monthly Cost Estimate:**

#### Storage Costs
```
Standard Storage: 10 GB × ¥0.0115/GB/month = ¥0.115

Monthly Storage Cost ≈ ¥0.12 (minimal)
```

#### Data Transfer Costs (via CDN)
```
CDN Downstream Traffic: 500 GB
- Price Tier 1: First 10 GB free
- Price Tier 2: 10-50 GB @ ¥0.29/GB = ¥11.60
- Price Tier 3: 50-100 GB @ ¥0.24/GB = ¥12.00
- Price Tier 4: 100-500 GB @ ¥0.21/GB = ¥84.00
- Total: ¥107.60

CDN Egress = 500 GB × ¥0.21/GB (avg) ≈ ¥105
Back-to-Origin (5% of CDN): 25 GB × ¥0.15/GB ≈ ¥3.75

Total Transfer Cost ≈ ¥108.75
```

#### API Request Costs
```
Estimated Requests:
- Image uploads: 5000/month × ¥0.01/1000 = ¥0.05
- Image views via CDN: 500,000/month × ¥0.01/1000 = ¥5.00
- Back-to-origin requests: 50,000/month × ¥0.01/1000 = ¥0.50

Total Request Cost ≈ ¥5.55
```

**Total Monthly Cost Estimate: ¥113 - ¥120**

**Comparison:**
- Aliyun OSS Direct (no CDN): ¥180-200/month (higher bandwidth)
- Tencent Cloud COS: ¥100-130/month (similar pricing)
- AWS S3 + CloudFront: $150-200/month (for China regions)

**Cost Optimization Tips:**
1. Enable CDN for all image deliveries (saves ¥75-100/month)
2. Use Resource Plans for predictable traffic (10-20% discount)
3. Compress images before upload (reduces transfer)
4. Set appropriate cache TTL (reduce origin bandwidth)

### 6. Node.js SDK Implementation

**Installation:**
```bash
npm install ali-oss
```

**Basic Configuration:**
```javascript
const OSS = require('ali-oss');

const ossClient = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: 'fridgemenu-images'
});

module.exports = ossClient;
```

**Upload Image Example:**
```javascript
const fs = require('fs');
const ossClient = require('./oss-client');

async function uploadImage(filePath, fileName) {
  try {
    const result = await ossClient.put(fileName, filePath);

    // Generate permanent public URL
    const permanentUrl = `https://images.fridgemenu.cn/fridgemenu-images/${fileName}`;
    // OR direct OSS URL
    const ossUrl = result.url;

    console.log('Upload Success:', permanentUrl);
    return permanentUrl;
  } catch (err) {
    console.error('Upload Failed:', err);
    throw err;
  }
}

module.exports = uploadImage;
```

**Convert JPG and Upload Example:**
```javascript
const sharp = require('sharp');
const uploadImage = require('./upload');

async function uploadConvertedImage(inputPath, recipeName) {
  const jpgFileName = `${recipeName}_${Date.now()}.jpg`;
  const jpgPath = `/tmp/${jpgFileName}`;

  try {
    // Convert image to JPG with compression
    await sharp(inputPath)
      .jpeg({ quality: 85, progressive: true })
      .toFile(jpgPath);

    // Upload to Aliyun OSS
    const imageUrl = await uploadImage(jpgPath, jpgFileName);

    // Save URL to database
    return imageUrl;
  } catch (err) {
    console.error('Conversion/Upload failed:', err);
    throw err;
  }
}

module.exports = uploadConvertedImage;
```

**List Images Example:**
```javascript
async function listImages(prefix = '') {
  try {
    const result = await ossClient.list({
      prefix: prefix,
      'max-keys': 100
    });

    return result.objects.map(obj => ({
      name: obj.name,
      url: `https://images.fridgemenu.cn/fridgemenu-images/${obj.name}`,
      size: obj.size,
      lastModified: obj.lastModified
    }));
  } catch (err) {
    console.error('List failed:', err);
    throw err;
  }
}

module.exports = listImages;
```

**Download/View Image Example:**
```javascript
async function downloadImage(fileName) {
  try {
    const result = await ossClient.get(fileName);

    // Return as stream for web display
    return result.content;
  } catch (err) {
    console.error('Download failed:', err);
    throw err;
  }
}

module.exports = downloadImage;
```

**Error Handling Pattern:**
```javascript
async function uploadImageWithRetry(filePath, fileName, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await ossClient.put(fileName, filePath);
      console.log(`Upload succeeded on attempt ${attempt}`);
      return `https://images.fridgemenu.cn/fridgemenu-images/${fileName}`;
    } catch (err) {
      lastError = err;
      console.warn(`Upload attempt ${attempt} failed:`, err.message);

      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt - 1) * 1000)
        );
      }
    }
  }

  throw lastError;
}

module.exports = uploadImageWithRetry;
```

**Environment Variables Setup:**
```bash
# .env file
ALIYUN_REGION=oss-cn-hangzhou
ALIYUN_BUCKET=fridgemenu-images
ALIYUN_ACCESS_KEY_ID=your_key_id
ALIYUN_ACCESS_KEY_SECRET=your_key_secret
ALIYUN_CDN_DOMAIN=images.fridgemenu.cn
ALIYUN_OSS_ENDPOINT=https://fridgemenu-images.oss-cn-hangzhou.aliyuncs.com
```

---

## Security Considerations

### Public-Read Bucket Security Best Practices

1. **Object-Level ACL (Recommended):**
   - Keep bucket private
   - Set individual objects to public-read
   - Provides granular control

2. **Bucket-Level Public Access (Simpler):**
   - Set bucket to public-read
   - All objects automatically accessible
   - Easier management, less control

3. **Anti-Hotlink Protection:**
   ```
   Enable Referer Whitelist:
   - Allow: yourdomains.com
   - Allow: images.fridgemenu.cn
   - Block: * (deny all other referrers)
   ```

4. **Access Logging:**
   - Enable server-side logging
   - Monitor for unusual access patterns
   - Store logs in separate archive bucket

5. **Content Security:**
   - Images cannot be modified externally
   - URLs are static and unchangeable
   - Deletion requires Aliyun console access (with credentials)

### Data Privacy & Compliance

1. **ICP Registration:** Required for serving content to China users
2. **GDPR:** If storing user data in images, ensure compliance
3. **Data Retention:** Set lifecycle policies for old images
4. **Encryption:** Enable server-side encryption (AES-256)

---

## CDN Configuration for Optimal Performance

### 1. Geographic Distribution
```
Primary Coverage: Mainland China + Hong Kong
- Tier 1 Cities (Beijing, Shanghai, Guangzhou, etc.): <100ms
- Tier 2-3 Cities: <300ms
- Latency Target: <500ms nationwide
```

### 2. Bandwidth Optimization
```
Peak Traffic Handling: 1000 concurrent users
- Expected peak bandwidth: 50-100 Mbps
- CDN nodes auto-scale based on traffic
- No additional configuration needed
```

### 3. Cache Hit Ratio Target: >80%
```
Optimization Strategies:
- Set TTL to 30 days for stable content
- Enable compression (gzip, Brotli)
- Monitor cache effectiveness
- Adjust rules based on actual usage patterns
```

---

## Implementation Timeline

**Week 1:**
- [ ] Create Aliyun CDN account (if not exists)
- [ ] Create OSS bucket in CN-Hangzhou region
- [ ] Configure bucket as public-read
- [ ] Set up custom domain in CDN console
- [ ] Configure DNS CNAME record

**Week 2:**
- [ ] Integrate ali-oss SDK into Node.js backend
- [ ] Implement image upload function
- [ ] Implement image URL generation logic
- [ ] Add error handling and retry logic
- [ ] Setup environment variables

**Week 3:**
- [ ] Test upload/download with actual images
- [ ] Verify CDN delivery and URL permanence
- [ ] Monitor CDN performance metrics
- [ ] Optimize cache settings based on metrics
- [ ] Load testing with 1000+ concurrent requests

**Week 4:**
- [ ] Migration of existing images (if any)
- [ ] Update database URL references
- [ ] Performance benchmarking
- [ ] Documentation for team
- [ ] Production deployment

---

## Monitoring and Maintenance

### Key Metrics to Monitor

1. **Storage:**
   - Total objects count
   - Total storage size (vs. quota)
   - Storage growth rate

2. **Traffic:**
   - Daily/monthly bandwidth usage
   - Peak bandwidth hours
   - Cost per GB trend

3. **CDN Performance:**
   - Cache hit ratio (target: >80%)
   - Average response time
   - Error rates

4. **Cost:**
   - Daily cost trend
   - Cost per user
   - Cost efficiency improvements

### Aliyun Console Dashboard
- Monitor all metrics in: Aliyun Console > OSS/CDN > Overview
- Set up alerts for quota thresholds (¥1000/month usage)
- Review cost reports monthly

### Recommended Tools
- **Aliyun Console:** Built-in monitoring
- **CloudWatch (if cross-cloud):** Integration with other services
- **Custom Metrics:** Track image uploads via API logs

---

## Conclusion

Aliyun OSS with CDN acceleration provides the optimal balance of:
- Cost efficiency (¥110-120/month for 10GB)
- Permanent URLs (no expiration)
- Excellent China performance (2000+ nodes)
- Seamless integration with existing Aliyun services
- Simple Node.js implementation

This solution eliminates the 24-hour temporary URL limitation of Aliyun Tongyi and provides a scalable, reliable image hosting platform for your FridgeMenu application.

---

## References and Sources

### Research Sources
1. [Alibaba Cloud vs Tencent Cloud 2025 Gartner Comparison](https://www.gartner.com/reviews/market/public-cloud-storage-services-worldwide/compare/alibaba-cloud-vs-tencent-cloud)
2. [Best CDN for China 2025 Guide](https://edgeone.ai/blog/details/best-cdn-for-china)
3. [Aliyun OSS Permanent URLs Documentation](https://stackoverflow.com/questions/67963972/is-it-possible-to-make-unlimited-time-on-aliyun-oss-when-generating-link)
4. [Aliyun OSS Official Documentation](https://www.alibabacloud.com/help/en/oss/developer-reference/installation-7)
5. [Aliyun OSS Pricing](https://www.alibabacloud.com/product/oss/pricing)
6. [Tencent Cloud COS Pricing](https://www.tencentcloud.com/pricing/cos?lang=en)
7. [Tencent Cloud COS Node.js SDK](https://www.tencentcloud.com/document/product/436/8629)
8. [China CDN Best Practices](https://www.21cloudbox.com/china-cdn-guide.html)
9. [Aliyun CDN Integration with OSS](https://www.alibabacloud.com/help/en/oss/user-guide/use-cdn-to-accelerate-access-to-oss)
10. [ali-oss NPM Package](https://www.npmjs.com/package/ali-oss)
11. [Image CDN Security Best Practices](https://cloudinary.com/blog/on_the_fly_image_manipulations_secured_with_signed_urls)
12. [Secure CDN Content Delivery](https://blog.cdnsun.com/securing-access-to-your-cdn-content/)

---

**Report Generated:** December 4, 2025
**Reviewed by:** AI Research Assistant
**Status:** Ready for Implementation
