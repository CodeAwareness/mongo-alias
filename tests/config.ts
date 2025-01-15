import dotenv   from 'dotenv'
import path     from 'path'
import * as Yup from 'yup'

dotenv.config({ path: path.join(__dirname, '.env') })

const envVarsSchema = Yup.object()
  .shape({
    NODE_ENV: Yup.string().oneOf(['production', 'development', 'test']).required(),
    MONGODB_URL: Yup.string().required(),
    MONGODB_DB: Yup.string().required(),
  })
  .unknown()

const envVars = envVarsSchema.validateSync(process.env)
export default {
  mongo: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    db: envVars.MONGODB_DB,
  },
}
