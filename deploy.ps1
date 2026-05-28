$KEY = "C:\Users\Admin\Downloads\amanzi_ats_key.pem"
$SERVER = "ec2-user@13.201.116.154"
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

Write-Host "Restarting server..." -ForegroundColor Green
ssh -i $KEY $SERVER "sed -i 's/13\.232\.152\.176/13.201.116.154/g' /home/ec2-user/amanzi_ats/frontend/dist/assets/*.js && chmod -R 755 /home/ec2-user/amanzi_ats/frontend/dist && pm2 restart all"

Write-Host "? Deploy complete! Site is live." -ForegroundColor Green
