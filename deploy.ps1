$KEY = "C:\Users\Admin\Downloads\amanzi_ats_key.pem"
$SERVER = "ec2-user@3.109.90.13"
$PROJECT = "C:\Users\Admin\Downloads\AMANZI_ATS"

Write-Host "Building frontend..." -ForegroundColor Green
cd "$PROJECT\frontend"
npm run build

Write-Host "Building backend..." -ForegroundColor Green
cd "$PROJECT\backend"
npm run build

Write-Host "Uploading frontend..." -ForegroundColor Green
scp -i $KEY -r "$PROJECT\frontend\dist" "${SERVER}:/home/ec2-user/amanzi_ats/frontend/"

Write-Host "Uploading backend dist..." -ForegroundColor Green
scp -i $KEY -r "$PROJECT\backend\dist" "${SERVER}:/home/ec2-user/amanzi_ats/backend/"

Write-Host "Fixing IPs and URLs on server..." -ForegroundColor Green
ssh -i $KEY $SERVER "for f in /home/ec2-user/amanzi_ats/frontend/dist/assets/index-*.js; do sed -i 's/localhost:3003//g' `$f; sed -i 's|http://3\.109\.90\.13/api|http://3.109.90.13|g' `$f; sed -i 's/13\.232\.152\.176/3.109.90.13/g' `$f; sed -i 's/13\.201\.116\.154/3.109.90.13/g' `$f; done && chmod -R 755 /home/ec2-user/amanzi_ats/frontend/dist && pm2 restart all --update-env && sudo systemctl restart nginx"

Write-Host " Deploy complete! Site is live at http://3.109.90.13" -ForegroundColor Green
